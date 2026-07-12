(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.PostureMath = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    var ACTIVITY_STRATEGIES = {
        writing: {
            label: '写字作业',
            headDownRatio: 0.72,
            chinDownRatio: 0.58,
            trunkForwardDelta: 0.22,
            prompt: '抬一点头，腰背坐直一点'
        },
        reading: {
            label: '阅读',
            headDownRatio: 0.66,
            chinDownRatio: 0.52,
            trunkForwardDelta: 0.2,
            prompt: '把书拿近一点，头不用低太多'
        },
        drawing: {
            label: '绘画/手工',
            headDownRatio: 0.65,
            chinDownRatio: 0.5,
            trunkForwardDelta: 0.24,
            experimental: true,
            prompt: '稍微坐直一点，眼睛离桌面远一点'
        },
        other: {
            label: '其他',
            headDownRatio: 0.68,
            chinDownRatio: 0.52,
            trunkForwardDelta: 0.22,
            experimental: true,
            prompt: '调整一下坐姿，休息一下肩膀'
        }
    };

    function roundMetric(value) {
        return Math.round(value * 10000) / 10000;
    }

    function distance(a, b) {
        var dx = a.x - b.x;
        var dy = a.y - b.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function midpoint(a, b) {
        return {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2
        };
    }

    function getMetrics(lm) {
        var nose = lm[0];
        var leftEye = lm[2]; var rightEye = lm[5];
        var leftEar = lm[7]; var rightEar = lm[8];
        var leftMouth = lm[9]; var rightMouth = lm[10];
        var leftShoulder = lm[11]; var rightShoulder = lm[12];
        var leftHip = lm[23]; var rightHip = lm[24];
        var shoulders = midpoint(leftShoulder, rightShoulder);
        var hips = leftHip && rightHip ? midpoint(leftHip, rightHip) : { x: shoulders.x, y: shoulders.y };
        var avgEarY = (leftEar.y + rightEar.y) / 2;
        var avgShoulderY = shoulders.y;
        var avgEyeY = (leftEye.y + rightEye.y) / 2;
        var avgMouthY = (leftMouth.y + rightMouth.y) / 2;
        var noseY = nose.y;
        var earShoulderDist = avgShoulderY - avgEarY;
        var eyeShoulderDist = avgShoulderY - avgEyeY;
        var noseShoulderDist = avgShoulderY - noseY;
        var mouthShoulderDist = avgShoulderY - avgMouthY;
        var noseMouthDist = avgMouthY - noseY;
        var earDiffY = Math.abs(leftEar.y - rightEar.y);
        var eyeDiffY = Math.abs(leftEye.y - rightEye.y);
        var earTiltAngle = Math.atan2(rightEar.y - leftEar.y, Math.abs(rightEar.x - leftEar.x)) * 180 / Math.PI;
        var shoulderWidth = leftShoulder && rightShoulder ? distance(leftShoulder, rightShoulder) : 0;
        var trunkLength = leftHip && rightHip ? distance(shoulders, hips) : 0;
        var trunkForwardRatio = trunkLength > 0 ? Math.abs(shoulders.x - hips.x) / trunkLength : 0;
        var earShoulderRatio = shoulderWidth > 0 ? earShoulderDist / shoulderWidth : 0;
        var noseShoulderRatio = shoulderWidth > 0 ? noseShoulderDist / shoulderWidth : 0;
        var trunkAngle = trunkLength > 0 ? Math.atan2(hips.y - shoulders.y, hips.x - shoulders.x) * 180 / Math.PI : 90;

        return {
            earShoulderDist: earShoulderDist,
            eyeShoulderDist: eyeShoulderDist,
            noseShoulderDist: noseShoulderDist,
            mouthShoulderDist: mouthShoulderDist,
            noseMouthDist: noseMouthDist,
            earDiffY: earDiffY,
            eyeDiffY: eyeDiffY,
            earTiltAngle: earTiltAngle,
            shoulderWidth: roundMetric(shoulderWidth),
            trunkLength: roundMetric(trunkLength),
            trunkForwardRatio: roundMetric(trunkForwardRatio),
            earShoulderRatio: roundMetric(earShoulderRatio),
            noseShoulderRatio: roundMetric(noseShoulderRatio),
            trunkAngle: roundMetric(trunkAngle)
        };
    }

    function median(values) {
        if (!values.length) throw new Error('median requires at least one value');
        var sorted = values.slice().sort(function (a, b) { return a - b });
        var mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    function hasReliableLandmarks(lm, minimumVisibility) {
        var threshold = minimumVisibility === undefined ? 0.6 : minimumVisibility;
        var required = [0, 2, 5, 7, 8, 9, 10, 11, 12];
        return required.every(function (i) {
            return lm[i] && (lm[i].visibility === undefined || lm[i].visibility >= threshold);
        });
    }

    function assessPlacementFrame(lm) {
        if (!lm || !hasReliableLandmarks(lm)) {
            return { ok: false, reason: 'unreliable', message: '请确认头部和双肩都清楚入镜。' };
        }
        var metrics = getMetrics(lm);
        if (metrics.shoulderWidth < 0.12) {
            return { ok: false, reason: 'too-far', message: '孩子在画面里太小，请把设备靠近一点。' };
        }
        if (metrics.shoulderWidth > 0.75) {
            return { ok: false, reason: 'too-close', message: '距离太近，请把设备稍微放远一点。' };
        }
        return { ok: true, reason: 'ready', message: '头部和双肩清楚，距离也合适。' };
    }

    function getActivityStrategy(activity) {
        return ACTIVITY_STRATEGIES[activity] || ACTIVITY_STRATEGIES.other;
    }

    function hasScaleShift(metrics, baseline) {
        if (!metrics || !baseline || !baseline.shoulderWidth) return false;
        var shoulderRatio = metrics.shoulderWidth / baseline.shoulderWidth;
        var trunkShifted = false;
        if (baseline.trunkLength && metrics.trunkLength) {
            var trunkRatio = metrics.trunkLength / baseline.trunkLength;
            trunkShifted = trunkRatio < 0.55 || trunkRatio > 1.7;
        }
        return shoulderRatio < 0.55 || shoulderRatio > 1.7 || trunkShifted;
    }

    function classifyPostureFrame(input) {
        if (!input || input.reliable === false || !input.metrics || !input.baseline) {
            return { scoreable: false, labels: ['unscorable'], reason: input && input.reliable === false ? 'unreliable' : 'missing-data' };
        }

        var metrics = input.metrics;
        var baseline = input.baseline;
        if (hasScaleShift(metrics, baseline)) {
            return { scoreable: false, labels: ['unscorable'], reason: 'scale-shift' };
        }

        var strategy = input.strategy || ACTIVITY_STRATEGIES.other;
        var labels = [];
        var headRatio = baseline.noseShoulderDist ? metrics.noseShoulderDist / baseline.noseShoulderDist : 1;
        var chinRatio = baseline.noseMouthDist ? metrics.noseMouthDist / baseline.noseMouthDist : 1;
        var trunkDelta = Math.abs((metrics.trunkForwardRatio || 0) - (baseline.trunkForwardRatio || 0));

        if (headRatio < strategy.headDownRatio || chinRatio < strategy.chinDownRatio) labels.push('low-head');
        if (trunkDelta >= strategy.trunkForwardDelta) labels.push('hunched');
        if (!labels.length) labels.push('good');

        return { scoreable: true, labels: labels, reason: 'scoreable' };
    }

    return {
        ACTIVITY_STRATEGIES: ACTIVITY_STRATEGIES,
        getMetrics: getMetrics,
        median: median,
        hasReliableLandmarks: hasReliableLandmarks,
        assessPlacementFrame: assessPlacementFrame,
        getActivityStrategy: getActivityStrategy,
        classifyPostureFrame: classifyPostureFrame
    };
});
