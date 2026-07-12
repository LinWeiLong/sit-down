const test = require('node:test');
const assert = require('node:assert/strict');
const {
    getMetrics,
    median,
    hasReliableLandmarks,
    assessPlacementFrame,
    classifyPostureFrame,
    getActivityStrategy
} = require('../src/js/posture-math.js');

function landmarks(visibility = 1) {
    return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility }));
}

function placedLandmarks() {
    const lm = landmarks();
    lm[0] = { x: 0.5, y: 0.25, visibility: 1 };
    lm[2] = { x: 0.47, y: 0.28, visibility: 1 };
    lm[5] = { x: 0.53, y: 0.28, visibility: 1 };
    lm[7] = { x: 0.45, y: 0.3, visibility: 1 };
    lm[8] = { x: 0.55, y: 0.3, visibility: 1 };
    lm[9] = { x: 0.48, y: 0.34, visibility: 1 };
    lm[10] = { x: 0.52, y: 0.34, visibility: 1 };
    lm[11] = { x: 0.35, y: 0.55, visibility: 1 };
    lm[12] = { x: 0.65, y: 0.55, visibility: 1 };
    lm[23] = { x: 0.42, y: 0.85, visibility: 1 };
    lm[24] = { x: 0.58, y: 0.85, visibility: 1 };
    return lm;
}

test('median rejects outliers for odd and even samples', () => {
    assert.equal(median([1, 100, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 2.5);
});

test('visibility requires every posture landmark to be reliable', () => {
    const lm = landmarks();
    assert.equal(hasReliableLandmarks(lm), true);
    lm[7].visibility = 0.2;
    assert.equal(hasReliableLandmarks(lm), false);
});

test('placement assessment requires reliable head, shoulders, hips, and usable scale', () => {
    const lm = placedLandmarks();

    assert.deepEqual(assessPlacementFrame(lm), {
        ok: true,
        reason: 'ready',
        message: '头部、双肩和髋部都清楚，距离也合适。'
    });

    lm[23].visibility = 0.2;
    assert.equal(assessPlacementFrame(lm).reason, 'unreliable');

    lm[23].visibility = 1;
    lm[11].x = 0.48;
    lm[12].x = 0.52;
    assert.equal(assessPlacementFrame(lm).reason, 'too-far');
});

test('ear tilt is measured in degrees without a near-zero division', () => {
    const lm = landmarks();
    lm[7] = { x: 0.4, y: 0.4, visibility: 1 };
    lm[8] = { x: 0.6, y: 0.42, visibility: 1 };
    lm[2].y = lm[5].y = 0.4;
    lm[9].y = lm[10].y = 0.48;
    lm[0].y = 0.43;
    lm[11].y = lm[12].y = 0.7;
    const metrics = getMetrics(lm);
    assert.ok(metrics.earTiltAngle > 5 && metrics.earTiltAngle < 6);
    assert.ok(Number.isFinite(metrics.earTiltAngle));
});

test('metrics include normalized shoulder, trunk, and ear shoulder relationships', () => {
    const lm = landmarks();
    lm[7] = { x: 0.46, y: 0.34, visibility: 1 };
    lm[8] = { x: 0.54, y: 0.35, visibility: 1 };
    lm[0] = { x: 0.5, y: 0.4, visibility: 1 };
    lm[11] = { x: 0.35, y: 0.55, visibility: 1 };
    lm[12] = { x: 0.65, y: 0.55, visibility: 1 };
    lm[23] = { x: 0.42, y: 0.9, visibility: 1 };
    lm[24] = { x: 0.58, y: 0.9, visibility: 1 };

    const metrics = getMetrics(lm);
    assert.equal(metrics.shoulderWidth, 0.3);
    assert.equal(metrics.trunkLength, 0.35);
    assert.ok(metrics.trunkForwardRatio < 0.01);
    assert.ok(metrics.earShoulderRatio > 0.5);
});

test('posture classifier separates good, low head, hunched torso, and unscorable frames', () => {
    const strategy = getActivityStrategy('writing');
    const baseline = {
        noseShoulderDist: 0.25,
        noseMouthDist: 0.08,
        trunkForwardRatio: 0.05,
        shoulderWidth: 0.3,
        trunkLength: 0.35
    };

    assert.deepEqual(classifyPostureFrame({
        metrics: { noseShoulderDist: 0.24, noseMouthDist: 0.08, trunkForwardRatio: 0.06, shoulderWidth: 0.3, trunkLength: 0.35 },
        baseline,
        strategy
    }), { scoreable: true, labels: ['good'], reason: 'scoreable' });

    assert.deepEqual(classifyPostureFrame({
        metrics: { noseShoulderDist: 0.12, noseMouthDist: 0.03, trunkForwardRatio: 0.06, shoulderWidth: 0.3, trunkLength: 0.35 },
        baseline,
        strategy
    }), { scoreable: true, labels: ['low-head'], reason: 'scoreable' });

    assert.deepEqual(classifyPostureFrame({
        metrics: { noseShoulderDist: 0.24, noseMouthDist: 0.08, trunkForwardRatio: 0.34, shoulderWidth: 0.3, trunkLength: 0.35 },
        baseline,
        strategy
    }), { scoreable: true, labels: ['hunched'], reason: 'scoreable' });

    assert.deepEqual(classifyPostureFrame({
        reliable: false,
        metrics: { noseShoulderDist: 0.24, noseMouthDist: 0.08, trunkForwardRatio: 0.06, shoulderWidth: 0.3, trunkLength: 0.35 },
        baseline,
        strategy
    }), { scoreable: false, labels: ['unscorable'], reason: 'unreliable' });
});

test('posture classifier pauses scoring when device scale changes sharply', () => {
    const baseline = {
        noseShoulderDist: 0.25,
        noseMouthDist: 0.08,
        trunkForwardRatio: 0.05,
        shoulderWidth: 0.3,
        trunkLength: 0.35
    };

    assert.deepEqual(classifyPostureFrame({
        metrics: { noseShoulderDist: 0.24, noseMouthDist: 0.08, trunkForwardRatio: 0.05, shoulderWidth: 0.11, trunkLength: 0.12 },
        baseline,
        strategy: getActivityStrategy('reading')
    }), { scoreable: false, labels: ['unscorable'], reason: 'scale-shift' });
});
