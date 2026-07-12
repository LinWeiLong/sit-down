const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createStudySession,
    transitionSession,
    validateSessionConfig,
    scoreSessionSummary
} = require('../src/js/session-model.js');

test('validates activity and 5 to 45 minute study duration', () => {
    assert.deepEqual(validateSessionConfig({ activity: 'writing', plannedMinutes: 15 }), {
        ok: true,
        activity: 'writing',
        plannedMinutes: 15
    });
    assert.equal(validateSessionConfig({ activity: 'writing', plannedMinutes: 4 }).ok, false);
    assert.equal(validateSessionConfig({ activity: 'gaming', plannedMinutes: 15 }).ok, false);
});

test('study session state machine requires placement and calibration before focus', () => {
    const session = createStudySession({ activity: 'reading', plannedMinutes: 10, now: 1000 });
    assert.equal(session.state, 'ready');
    assert.equal(transitionSession(session, 'START_PLACEMENT', 1100).state, 'placement');
    assert.throws(() => transitionSession(session, 'START_FOCUS', 1200), /Invalid transition/);
});

test('background interruption pauses scoring and requires recalibration', () => {
    const ready = createStudySession({ activity: 'writing', plannedMinutes: 15, now: 1000 });
    const placement = transitionSession(ready, 'START_PLACEMENT', 1100);
    const calibration = transitionSession(placement, 'PLACEMENT_OK', 1200);
    const focus = transitionSession(calibration, 'CALIBRATION_OK', 1300);
    const interrupted = transitionSession(focus, 'APP_BACKGROUND', 5000);
    assert.equal(interrupted.state, 'interrupted');
    assert.equal(interrupted.interruptionReason, 'app-background');
    assert.equal(transitionSession(interrupted, 'RESUME', 6000).state, 'placement');
});

test('posture score uses reliable detection time and hides low reliability scores', () => {
    assert.deepEqual(scoreSessionSummary({
        plannedMs: 15 * 60 * 1000,
        reliableMs: 10 * 60 * 1000,
        goodMs: 8 * 60 * 1000
    }), {
        kind: 'score',
        score: 80,
        reliableRatio: 0.6667
    });

    assert.deepEqual(scoreSessionSummary({
        plannedMs: 15 * 60 * 1000,
        reliableMs: 2 * 60 * 1000,
        goodMs: 2 * 60 * 1000
    }), {
        kind: 'insufficient-data',
        reliableRatio: 0.1333
    });
});
