const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyStartupError, createStartupController } = require('../src/js/startup-controller.js');

test('classifies browser, permission, device, and model startup failures without exposing device data', () => {
    assert.equal(classifyStartupError({ code: 'unsupported' }).code, 'unsupported');
    assert.equal(classifyStartupError({ name: 'SecurityError' }).code, 'insecure-or-policy');
    assert.equal(classifyStartupError({ name: 'NotAllowedError' }).code, 'permission-denied');
    assert.equal(classifyStartupError({ name: 'NotFoundError' }).code, 'no-camera');
    assert.equal(classifyStartupError({ name: 'NotReadableError' }).code, 'camera-busy');
    assert.equal(classifyStartupError(new Error('model runtime failed')).code, 'model-failed');
    assert.equal(classifyStartupError({ name: 'UnknownError' }).code, 'unknown');
});

test('serializes concurrent starts and cleans prior resources before every retry or failure', async () => {
    const events = [];
    let attempt = 0;
    const controller = createStartupController({
        cleanup: () => events.push('cleanup'),
        start: async () => {
            attempt += 1;
            events.push('start-' + attempt);
            if (attempt === 1) throw Object.assign(new Error('busy'), { name: 'NotReadableError' });
            return 'ready';
        }
    });

    const first = controller.start();
    assert.equal(first, controller.start());
    await assert.rejects(first, /busy/);
    assert.deepEqual(events, ['cleanup', 'start-1', 'cleanup']);

    assert.equal(await controller.start(), 'ready');
    assert.deepEqual(events, ['cleanup', 'start-1', 'cleanup', 'cleanup', 'start-2']);
    controller.stop();
    assert.deepEqual(events, ['cleanup', 'start-1', 'cleanup', 'cleanup', 'start-2', 'cleanup']);
});

test('waits for a stopped attempt to settle before starting its retry', async () => {
    const resolvers = [];
    let starts = 0;
    const controller = createStartupController({
        cleanup: () => {},
        start: () => new Promise(resolve => {
            starts += 1;
            resolvers.push(resolve);
        })
    });

    const first = controller.start();
    await Promise.resolve();
    controller.stop();
    const retry = controller.start();
    assert.equal(starts, 1);

    resolvers[0]('old');
    await assert.rejects(first, error => error.code === 'cancelled');
    await Promise.resolve();
    assert.equal(starts, 2);
    assert.equal(controller.isStarting(), true);

    controller.start();
    assert.equal(starts, 2);
    resolvers[1]('new');
    assert.equal(await retry, 'new');
});
