const test = require('node:test');
const assert = require('node:assert/strict');

const { classifyStartupError, createCameraStartup } = require('../src/js/camera-startup.js');

test('classifies browser, permission, device, and model startup failures without exposing device data', () => {
    assert.equal(classifyStartupError({ code: 'unsupported' }).code, 'unsupported');
    assert.equal(classifyStartupError({ name: 'SecurityError' }).code, 'insecure-or-policy');
    assert.equal(classifyStartupError({ name: 'NotAllowedError' }).code, 'permission-denied');
    assert.equal(classifyStartupError({ name: 'NotFoundError' }).code, 'no-camera');
    assert.equal(classifyStartupError({ name: 'NotReadableError' }).code, 'camera-busy');
    assert.equal(classifyStartupError(new Error('model runtime failed')).code, 'model-failed');
    assert.equal(classifyStartupError({ name: 'UnknownError' }).code, 'unknown');
});

test('reuses one start attempt and cleans resources before retry, failure, and dispose', async () => {
    const events = [];
    let attempt = 0;
    const startup = createCameraStartup({
        cleanup: () => events.push('cleanup'),
        start: async () => {
            attempt += 1;
            events.push('start-' + attempt);
            if (attempt === 1) throw Object.assign(new Error('busy'), { name: 'NotReadableError' });
            return 'ready';
        }
    });

    const first = startup.start();
    assert.equal(first, startup.start());
    await assert.rejects(first, /busy/);
    assert.deepEqual(events, ['cleanup', 'start-1', 'cleanup']);

    assert.equal(await startup.retry(), 'ready');
    assert.deepEqual(events, ['cleanup', 'start-1', 'cleanup', 'cleanup', 'start-2']);
    startup.dispose();
    assert.deepEqual(events, ['cleanup', 'start-1', 'cleanup', 'cleanup', 'start-2', 'cleanup']);
});

test('waits for a disposed attempt to settle before retrying', async () => {
    const resolvers = [];
    let starts = 0;
    const startup = createCameraStartup({
        cleanup: () => {},
        start: () => new Promise(resolve => {
            starts += 1;
            resolvers.push(resolve);
        })
    });

    const first = startup.start();
    await Promise.resolve();
    startup.dispose();
    const retry = startup.retry();
    assert.equal(starts, 1);

    resolvers[0]('old');
    await assert.rejects(first, error => error.code === 'cancelled');
    await Promise.resolve();
    assert.equal(starts, 2);
    assert.equal(startup.isStarting(), true);

    startup.start();
    assert.equal(starts, 2);
    resolvers[1]('new');
    assert.equal(await retry, 'new');
});
