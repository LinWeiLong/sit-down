(function () {
    var video = document.getElementById('video');
    var canvas = document.getElementById('canvas');
    var ctx = canvas.getContext('2d');
    var homeView = document.getElementById('homeView');
    var studyView = document.getElementById('studyView');
    var resultView = document.getElementById('resultView');
    var statusEl = document.getElementById('status');
    var sessionForm = document.getElementById('sessionForm');
    var startTrialBtn = document.getElementById('startTrialBtn');
    var settingsToggle = document.getElementById('settingsToggle');
    var activitySelect = document.getElementById('activitySelect');
    var durationInput = document.getElementById('durationInput');
    var durationOptions = Array.from(document.querySelectorAll('.duration-option'));
    var calibBtn = document.getElementById('calibBtn');
    var endBtn = document.getElementById('endBtn');
    var backHomeBtn = document.getElementById('backHomeBtn');
    var resultSummary = document.getElementById('resultSummary');

    var PoseMath = window.PostureMath;
    var SessionModel = window.StudySessionModel;
    var APP_VERSION = '20260714-demo-refactor';
    var debugLog = window.__sitDownDebugLog || function () { };
    debugLog('[sit-down] app script loaded', { href: window.location.href, debug: !!window.__SIT_DOWN_DEBUG__, appVersion: APP_VERSION });

    var pose = null;
    var camera = null;
    var activeSession = null;
    var activeStrategy = null;
    var baseline = null;
    var calibStartTime = null;
    var calibBuffer = [];
    var smoothMetrics = null;
    var focusStartedAt = null;
    var lastFrameAt = null;
    var sessionTimer = null;
    var firstResultsLogged = false;
    var focusPreviewLogged = false;
    var lastReliablePoseAt = 0;
    var encouragementSpoken = false;
    var postureState = {
        currentLabels: [],
        abnormalSince: {},
        lastAlertAt: {},
        lowHeadEvents: 0,
        hunchedEvents: 0,
        reliableMs: 0,
        goodMs: 0,
        unscorableMs: 0,
        recoveryDurations: []
    };

    var CALIBRATION_MS = 3000;
    var MIN_CALIBRATION_SAMPLES = 10;
    var ALERT_DELAY_MS = 2000;
    var ALERT_COOLDOWN_MS = 10000;
    var TARGET_FRAME_INTERVAL_MS = 100;

    function setView(name) {
        homeView.classList.toggle('hidden', name !== 'home');
        studyView.classList.toggle('hidden', name !== 'study');
        resultView.classList.toggle('hidden', name !== 'result');
    }

    function setStatus(text, kind) {
        statusEl.textContent = text;
        statusEl.dataset.kind = kind || 'info';
    }

    function fitCanvas() {
        if (!canvas.width || !canvas.height) return;
        var scale = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
        var width = Math.round(canvas.width * scale) + 'px';
        var height = Math.round(canvas.height * scale) + 'px';
        canvas.style.width = width;
        canvas.style.height = height;
        video.style.width = width;
        video.style.height = height;
    }

    function speakText(text) {
        var bridge = window.AndroidStudyBridge;
        if (bridge && typeof bridge.speak === 'function') {
            bridge.speak(text);
            return;
        }
        if (!('speechSynthesis' in window)) return;
        var utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'zh-CN';
        utter.rate = 0.92;
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utter);
    }

    function stopCamera() {
        if (sessionTimer) clearInterval(sessionTimer);
        sessionTimer = null;
        if (camera && typeof camera.stop === 'function') camera.stop();
        if (video.srcObject) {
            video.srcObject.getTracks().forEach(function (track) { track.stop(); });
            video.srcObject = null;
        }
    }

    function resetPostureState() {
        postureState = {
            currentLabels: [],
            abnormalSince: {},
            lastAlertAt: {},
            lowHeadEvents: 0,
            hunchedEvents: 0,
            reliableMs: 0,
            goodMs: 0,
            unscorableMs: 0,
            recoveryDurations: []
        };
        lastFrameAt = null;
    }

    function resetToPlacementForRecalibration(config) {
        if (sessionTimer) clearInterval(sessionTimer);
        sessionTimer = null;
        activeSession = SessionModel.createStudySession(config);
        activeStrategy = PoseMath.getActivityStrategy(config.activity);
        activeSession = SessionModel.transitionSession(activeSession, 'START_PLACEMENT', Date.now());
        baseline = null;
        calibStartTime = null;
        calibBuffer = [];
        smoothMetrics = null;
        focusStartedAt = null;
        focusPreviewLogged = false;
        encouragementSpoken = false;
        resetPostureState();
        calibBtn.disabled = false;
        setStatus('设置已应用。请确认头部和双肩入镜，然后点击开始校准。', 'info');
    }
    function renderResult(reason) {
        var now = Date.now();
        var actualMs = focusStartedAt ? Math.max(0, now - focusStartedAt) : 0;
        var score = SessionModel.scoreSessionSummary({
            plannedMs: activeSession ? activeSession.plannedMs : 0,
            reliableMs: postureState.reliableMs,
            goodMs: postureState.goodMs
        });
        var rows = [
            ['活动', activeStrategy ? activeStrategy.label : '未开始'],
            ['识别模式', '书桌上半身模式'],
            ['计划时长', activeSession ? activeSession.plannedMinutes + '分钟' : '未开始'],
            ['实际时长', Math.round(actualMs / 60000) + '分钟'],
            ['可靠检测比例', Math.round((score.reliableRatio || 0) * 100) + '%'],
            ['坐姿表现', score.kind === 'score' ? score.score + '分' : '数据不足'],
            ['低头提醒', postureState.lowHeadEvents + '次'],
            ['弯腰提醒', postureState.hunchedEvents + '次'],
            ['结束状态', reason === 'completed' ? '自然完成' : '中断/手动结束']
        ];
        resultSummary.innerHTML = rows.map(function (row) {
            return '<div class="summary-row"><span>' + row[0] + '</span><strong>' + row[1] + '</strong></div>';
        }).join('');
        setView('result');
    }

    function completeSession(reason) {
        stopCamera();
        if (activeSession && activeSession.state !== 'completed') {
            try { activeSession = SessionModel.transitionSession(activeSession, 'END', Date.now()); } catch (e) { }
        }
        if (reason === 'completed') speakText('本轮学习完成啦，起来活动一下，看看远处。');
        renderResult(reason);
    }

    function startFocus() {
        activeSession = SessionModel.transitionSession(activeSession, 'CALIBRATION_OK', Date.now());
        focusStartedAt = Date.now();
        resetPostureState();
        encouragementSpoken = false;
        calibBtn.disabled = true;
        setStatus('校准完成，开始学习。Demo 将继续显示识别画面，APP 里再进入专注黑屏模式。', 'ok');
        debugLog('[sit-down] focus started', { appVersion: APP_VERSION, canvasWidth: canvas.width, canvasHeight: canvas.height, videoWidth: video.videoWidth, videoHeight: video.videoHeight });
        speakText('校准完成，开始学习。');
        sessionTimer = setInterval(function () {
            if (!activeSession || activeSession.state !== 'focus') return;
            var elapsed = Date.now() - focusStartedAt;
            if (!encouragementSpoken && elapsed >= activeSession.plannedMs / 2) {
                encouragementSpoken = true;
                speakText('坚持得很好，继续保持舒服的坐姿。');
            }
            if (elapsed >= activeSession.plannedMs) completeSession('completed');
        }, 1000);
    }

    function beginCalibration() {
        if (!activeSession || activeSession.state !== 'calibration') return;
        calibBuffer = [];
        smoothMetrics = null;
        baseline = null;
        calibStartTime = Date.now();
        calibBtn.disabled = true;
        setStatus('请保持孩子平时的自然坐姿，正在采集校准样本...', 'ok');
    }

    function cancelCalibrationWithMessage(message) {
        calibStartTime = null;
        calibBuffer = [];
        calibBtn.disabled = false;
        if (activeSession && activeSession.state === 'calibration') {
            try { activeSession = SessionModel.transitionSession(activeSession, 'CALIBRATION_FAILED', Date.now()); } catch (e) { }
        }
        setStatus(message, 'warn');
    }


    function buildBaseline(samples) {
        var result = {};
        Object.keys(samples[0]).forEach(function (key) {
            if (typeof samples[0][key] === 'number' && Number.isFinite(samples[0][key])) {
                result[key] = PoseMath.median(samples.map(function (sample) { return sample[key]; }));
            }
        });
        return result;
    }

    function updateAbnormalTimers(labels, now) {
        ['low-head', 'hunched'].forEach(function (label) {
            var active = labels.indexOf(label) !== -1;
            if (active && !postureState.abnormalSince[label]) postureState.abnormalSince[label] = now;
            if (!active && postureState.abnormalSince[label]) {
                postureState.recoveryDurations.push(now - postureState.abnormalSince[label]);
                postureState.abnormalSince[label] = null;
            }
            if (!active || !postureState.abnormalSince[label]) return;

            var heldMs = now - postureState.abnormalSince[label];
            var lastAlertAt = postureState.lastAlertAt[label] || 0;
            if (heldMs >= ALERT_DELAY_MS && now - lastAlertAt >= ALERT_COOLDOWN_MS) {
                postureState.lastAlertAt[label] = now;
                if (label === 'low-head') {
                    postureState.lowHeadEvents += 1;
                    speakText('抬一点头，眼睛离书本远一点。');
                }
                if (label === 'hunched') {
                    postureState.hunchedEvents += 1;
                    speakText('腰背坐直一点，肩膀放轻松。');
                }
            }
        });
    }

    function renderFocusFeedback(classified) {
        if (!classified.scoreable) {
            setStatus('姿势校验中：当前画面变化较大，请保持设备和坐姿稳定。', 'warn');
            return;
        }
        if (classified.labels.indexOf('low-head') !== -1) {
            setStatus('检测到低头趋势：把头抬一点，眼睛离书本远一点。', 'warn');
            return;
        }
        if (classified.labels.indexOf('hunched') !== -1) {
            setStatus('检测到含胸弓背趋势：腰背坐直一点，肩膀放轻松。', 'warn');
            return;
        }
        if (classified.labels.indexOf('good') !== -1) {
            setStatus('坐姿很好，继续保持。', 'ok');
            return;
        }
        setStatus('姿势校验中，请保持自然坐姿。', 'info');
    }

    function handleFocusFrame(metrics, reliable) {
        var now = Date.now();
        var delta = lastFrameAt ? Math.min(now - lastFrameAt, 1000) : 0;
        lastFrameAt = now;
        var classified = PoseMath.classifyPostureFrame({
            reliable: reliable,
            metrics: metrics,
            baseline: baseline,
            strategy: activeStrategy
        });

        if (!classified.scoreable) {
            postureState.unscorableMs += delta;
            renderFocusFeedback(classified);
            return;
        }

        postureState.reliableMs += delta;
        if (classified.labels.indexOf('good') !== -1) postureState.goodMs += delta;
        updateAbnormalTimers(classified.labels, now);
        renderFocusFeedback(classified);
    }

    function drawPlacement(results, w, h) {
        ctx.clearRect(0, 0, w, h);
        ctx.save();
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(results.image, 0, 0, w, h);
        if (results.poseLandmarks && typeof drawConnectors !== 'undefined' && typeof drawLandmarks !== 'undefined') {
            drawConnectors(ctx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#28d17c', lineWidth: 3 });
            drawLandmarks(ctx, results.poseLandmarks, { color: '#ffffff', lineWidth: 1 });
        }
        ctx.restore();
    }

    function onResults(results) {
        if (!firstResultsLogged) {
            firstResultsLogged = true;
            debugLog('[sit-down] first pose results', {
                hasImage: !!(results && results.image),
                hasLandmarks: !!(results && results.poseLandmarks),
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight
            });
        }
        if (!activeSession) return;
        if (video.videoWidth > 0 && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            fitCanvas();
        }

        var now = Date.now();
        if (activeSession.state === 'focus' && lastFrameAt && now - lastFrameAt < TARGET_FRAME_INTERVAL_MS) return;

        var w = canvas.width;
        var h = canvas.height;
        var landmarks = results.poseLandmarks;
        var reliable = !!landmarks && PoseMath.hasReliableLandmarks(landmarks);

        drawPlacement(results, w, h);
        if (activeSession.state === 'focus' && !focusPreviewLogged) {
            focusPreviewLogged = true;
            debugLog('[sit-down] focus preview drawing', { appVersion: APP_VERSION, hasImage: !!results.image, hasLandmarks: !!landmarks, canvasWidth: w, canvasHeight: h });
        }

        if (!landmarks) {
            if (activeSession.state === 'calibration' && calibStartTime && Date.now() - calibStartTime >= CALIBRATION_MS) {
                cancelCalibrationWithMessage('校准失败：没有检测到孩子，请让头部和双肩进入画面后重试。');
                return;
            }
            setStatus('还没有检测到孩子，请让头部和双肩进入画面。', 'warn');
            return;
        }
        if (!reliable) {
            if (activeSession.state === 'calibration' && calibStartTime && Date.now() - calibStartTime >= CALIBRATION_MS) {
                cancelCalibrationWithMessage('校准失败：关键部位不够清楚，请确认头部和双肩没有被遮挡后重试。');
                return;
            }
            setStatus('关键部位不够清楚，请确认头部和双肩没有被遮挡。', 'warn');
            return;
        }
        lastReliablePoseAt = Date.now();

        var metrics = PoseMath.getMetrics(landmarks);
        if (!smoothMetrics) smoothMetrics = Object.assign({}, metrics);
        Object.keys(metrics).forEach(function (key) {
            if (typeof metrics[key] === 'number') smoothMetrics[key] = smoothMetrics[key] * 0.7 + metrics[key] * 0.3;
        });

        if (activeSession.state === 'placement') {
            setStatus('摆放合适：头部和双肩都在画面里。可以点击开始校准。', 'ok');
            return;
        }

        if (activeSession.state === 'calibration' && calibStartTime) {
            calibBuffer.push(metrics);
            var elapsed = Date.now() - calibStartTime;
            setStatus('校准中，请保持自然坐姿 ' + Math.min(3, Math.ceil(elapsed / 1000)) + '/3秒', 'ok');
            if (elapsed >= CALIBRATION_MS) {
                if (calibBuffer.length < MIN_CALIBRATION_SAMPLES) {
                    calibStartTime = null;
                    calibBtn.disabled = false;
                    setStatus('校准样本不足，请调整摆放后重试。', 'warn');
                    return;
                }
                baseline = buildBaseline(calibBuffer);
                calibStartTime = null;
                calibBuffer = [];
                startFocus();
            }
            return;
        }

        if (activeSession.state === 'focus') handleFocusFrame(smoothMetrics, reliable);
    }

    function setupPose() {
        setStatus('模型加载中，请稍候...', 'info');
        debugLog('[sit-down] setupPose begin', { hasPoseCtor: typeof Pose !== 'undefined' });
        pose = new Pose({ locateFile: function (file) {
            var located = './vendor/mediapipe/pose/' + file;
            debugLog('[sit-down] mediapipe locateFile', file, located);
            return located;
        } });
        pose.setOptions({ modelComplexity: 1, smoothLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
        pose.onResults(onResults);
        debugLog('[sit-down] setupPose done');
    }

    function startCamera() {
        debugLog('[sit-down] startCamera begin', {
            hasCameraCtor: typeof Camera !== 'undefined',
            protocol: window.location.protocol,
            mediaDevices: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)
        });
        canvas.width = 640;
        canvas.height = 480;
        fitCanvas();
        camera = new Camera(video, {
            onFrame: function () { return pose.send({ image: video }); },
            width: 640,
            height: 480
        });
        return camera.start().then(function () {
            debugLog('[sit-down] camera started', {
                videoWidth: video.videoWidth,
                videoHeight: video.videoHeight,
                readyState: video.readyState
            });
        });
    }

    durationOptions.forEach(function (button) {
        button.addEventListener('click', function () {
            durationOptions.forEach(function (item) { item.classList.remove('active'); });
            button.classList.add('active');
            durationInput.value = button.dataset.minutes;
        });
    });

    function getCurrentSessionConfig() {
        return { activity: activitySelect.value || 'writing', plannedMinutes: Number(durationInput.value || 15) };
    }

    function startTrialSession() {
        var config = getCurrentSessionConfig();
        var validated = SessionModel.validateSessionConfig(config);
        if (!validated.ok) {
            alert(validated.reason);
            return;
        }
        activeSession = SessionModel.createStudySession(config);
        activeStrategy = PoseMath.getActivityStrategy(config.activity);
        activeSession = SessionModel.transitionSession(activeSession, 'START_PLACEMENT', Date.now());
        calibBtn.disabled = false;
        sessionForm.classList.add('hidden');
        setView('study');
        setStatus('正在请求摄像头权限。请把设备固定在书桌前方，让头部和双肩入镜。', 'info');
        startCamera().then(function () {
            debugLog('[sit-down] startCamera resolved in trial handler');
            setStatus('请确认头部和双肩都在画面里，然后点击开始校准。', 'info');
        }).catch(function (err) {
            debugLog('[sit-down] startCamera failed', err);
            activeSession = null;
            setView('home');
            alert('摄像头打开失败，请允许摄像头权限后重试。');
            console.error(err);
        });
    }

    startTrialBtn.addEventListener('click', startTrialSession);
    settingsToggle.addEventListener('click', function () {
        var willShow = sessionForm.classList.contains('hidden');
        if (willShow && activeSession && activeSession.state === 'focus') {
            resetToPlacementForRecalibration(getCurrentSessionConfig());
            setStatus('已暂停本轮学习。调整设置后，可以重新开始校准。', 'info');
        }
        sessionForm.classList.toggle('hidden');
    });
    sessionForm.addEventListener('submit', function (event) {
        event.preventDefault();
        var config = getCurrentSessionConfig();
        var validated = SessionModel.validateSessionConfig(config);
        if (!validated.ok) {
            alert(validated.reason);
            return;
        }
        resetToPlacementForRecalibration({ activity: validated.activity, plannedMinutes: validated.plannedMinutes });
        sessionForm.classList.add('hidden');
    });

    calibBtn.addEventListener('click', function () {
        if (!activeSession) return;
        if (!firstResultsLogged) {
            debugLog('[sit-down] calibration ignored before first pose results');
            setStatus('模型还在加载或初始化，请等画面稳定后再点开始校准。', 'warn');
            return;
        }
        if (!lastReliablePoseAt || Date.now() - lastReliablePoseAt > 1500) {
            debugLog('[sit-down] calibration ignored before reliable pose', { lastReliablePoseAt: lastReliablePoseAt });
            setStatus('还不能校准：请先让头部和双肩清楚进入画面。', 'warn');
            return;
        }
        if (activeSession.state === 'placement') activeSession = SessionModel.transitionSession(activeSession, 'PLACEMENT_OK', Date.now());
        beginCalibration();
    });
    endBtn.addEventListener('click', function () { completeSession('manual'); });
    backHomeBtn.addEventListener('click', function () {
        activeSession = null;
        baseline = null;
        focusStartedAt = null;
        calibBtn.disabled = false;
        setView('home');
    });

    document.addEventListener('visibilitychange', function () {
        if (activeSession && activeSession.state === 'focus') {
            debugLog('[sit-down] visibility changed during focus', { hidden: document.hidden });
        }
    });

    window.addEventListener('resize', fitCanvas);
    window.addEventListener('load', function () {
        debugLog('[sit-down] window load', {
            hasPoseCtor: typeof Pose !== 'undefined',
            hasCameraCtor: typeof Camera !== 'undefined',
            hasDraw: typeof drawConnectors !== 'undefined'
        });
        try {
            setupPose();
            if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(function (err) { console.warn('离线缓存注册失败', err); });
        } catch (err) {
            console.error(err);
            alert('模型加载失败，请刷新页面或更换浏览器。');
        }
    });
})();
