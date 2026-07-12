(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.StudySessionModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    var ACTIVITIES = {
        writing: { label: '写字作业' },
        reading: { label: '阅读' },
        drawing: { label: '绘画/手工' },
        other: { label: '其他' }
    };

    var TRANSITIONS = {
        ready: {
            START_PLACEMENT: 'placement'
        },
        placement: {
            PLACEMENT_OK: 'calibration',
            CANCEL: 'finished'
        },
        calibration: {
            CALIBRATION_OK: 'focus',
            CALIBRATION_FAILED: 'placement',
            CANCEL: 'finished'
        },
        focus: {
            COMPLETE: 'completed',
            END: 'completed',
            APP_BACKGROUND: 'interrupted',
            CAMERA_ERROR: 'interrupted'
        },
        interrupted: {
            RESUME: 'placement',
            END: 'completed'
        },
        completed: {},
        finished: {}
    };

    function validateSessionConfig(config) {
        var activity = config && config.activity;
        var plannedMinutes = Number(config && config.plannedMinutes);

        if (!ACTIVITIES[activity]) {
            return { ok: false, reason: '请选择学习活动' };
        }

        if (!Number.isInteger(plannedMinutes) || plannedMinutes < 5 || plannedMinutes > 45) {
            return { ok: false, reason: '学习周期需要在5～45分钟之间' };
        }

        return { ok: true, activity: activity, plannedMinutes: plannedMinutes };
    }

    function createStudySession(config) {
        var validated = validateSessionConfig(config);
        if (!validated.ok) throw new Error(validated.reason);
        var now = Number(config.now || Date.now());

        return {
            id: 'session-' + now,
            activity: validated.activity,
            plannedMinutes: validated.plannedMinutes,
            plannedMs: validated.plannedMinutes * 60 * 1000,
            state: 'ready',
            createdAt: now,
            updatedAt: now,
            focusStartedAt: null,
            focusEndedAt: null,
            interruptionReason: null
        };
    }

    function transitionSession(session, event, now) {
        var current = session && session.state;
        var next = TRANSITIONS[current] && TRANSITIONS[current][event];
        if (!next) {
            throw new Error('Invalid transition: ' + current + ' -> ' + event);
        }

        var updated = Object.assign({}, session, {
            state: next,
            updatedAt: Number(now || Date.now())
        });

        if (next === 'focus' && !updated.focusStartedAt) {
            updated.focusStartedAt = updated.updatedAt;
        }

        if (next === 'completed' || next === 'finished' || next === 'interrupted') {
            updated.focusEndedAt = updated.focusEndedAt || updated.updatedAt;
        }

        if (event === 'APP_BACKGROUND') updated.interruptionReason = 'app-background';
        if (event === 'CAMERA_ERROR') updated.interruptionReason = 'camera-error';
        if (event === 'RESUME') {
            updated.interruptionReason = null;
            updated.focusStartedAt = null;
            updated.focusEndedAt = null;
        }

        return updated;
    }

    function round4(value) {
        return Math.round(value * 10000) / 10000;
    }

    function scoreSessionSummary(summary, options) {
        var plannedMs = Math.max(0, Number(summary.plannedMs || 0));
        var reliableMs = Math.max(0, Number(summary.reliableMs || 0));
        var goodMs = Math.max(0, Math.min(Number(summary.goodMs || 0), reliableMs));
        var minimumReliableRatio = options && options.minimumReliableRatio !== undefined
            ? options.minimumReliableRatio
            : 0.6;
        var reliableRatio = plannedMs > 0 ? reliableMs / plannedMs : 0;

        if (reliableMs <= 0 || reliableRatio < minimumReliableRatio) {
            return {
                kind: 'insufficient-data',
                reliableRatio: round4(reliableRatio)
            };
        }

        return {
            kind: 'score',
            score: Math.round(goodMs / reliableMs * 100),
            reliableRatio: round4(reliableRatio)
        };
    }

    return {
        ACTIVITIES: ACTIVITIES,
        createStudySession: createStudySession,
        transitionSession: transitionSession,
        validateSessionConfig: validateSessionConfig,
        scoreSessionSummary: scoreSessionSummary
    };
});
