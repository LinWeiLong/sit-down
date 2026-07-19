(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.CameraStartup = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    var MESSAGES = {
        unsupported: '这个浏览器暂不支持摄像头识别。请换用较新的浏览器或设备。',
        'insecure-or-policy': '摄像头需要在安全页面打开；请使用 HTTPS，并不要在受限制的嵌入页面中运行。',
        'permission-denied': '还没有摄像头权限。请让监护人在浏览器的网站设置中允许摄像头，然后重试。',
        'no-camera': '没有找到可用摄像头。请确认设备带有摄像头并已连接。',
        'camera-busy': '摄像头可能正在被其他应用占用。请关闭其他使用摄像头的应用后重试。',
        'model-failed': '本地姿态模型没有准备好。请稍等后重试；如果仍失败，请刷新页面。',
        unknown: '准备识别时遇到问题。请重试或回到开始页。'
    };

    function classifyStartupError(error) {
        var name = error && error.name;
        var code = error && error.code;
        var stage = error && error.stage;
        var message = String(error && error.message || '').toLowerCase();
        var result = 'unknown';

        if (code === 'unsupported') result = 'unsupported';
        else if (stage === 'model' || /\b(model|pose|wasm)\b/.test(message)) result = 'model-failed';
        else if (name === 'SecurityError' || code === 'insecure-or-policy') result = 'insecure-or-policy';
        else if (name === 'NotAllowedError' || name === 'PermissionDeniedError') result = 'permission-denied';
        else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') result = 'no-camera';
        else if (name === 'NotReadableError' || name === 'TrackStartError') result = 'camera-busy';

        return { code: result, message: MESSAGES[result] };
    }

    function createCameraStartup(options) {
        var start = options && options.start;
        var cleanup = options && options.cleanup || function () { };
        var activePromise = null;
        var queuedPromise = null;
        var generation = 0;
        var disposed = false;

        function safelyCleanup() {
            try { cleanup(); } catch (error) { }
        }

        function launch() {
            safelyCleanup();
            disposed = false;
            var attempt = ++generation;
            var promise = Promise.resolve().then(function () {
                return start();
            }).then(function (result) {
                if (disposed || attempt !== generation) {
                    safelyCleanup();
                    throw { code: 'cancelled' };
                }
                return result;
            }, function (error) {
                safelyCleanup();
                activePromise = null;
                throw error;
            });
            activePromise = promise;
            promise.then(function () {
                if (activePromise === promise) activePromise = null;
            }, function () {
                if (activePromise === promise) activePromise = null;
            });
            return promise;
        }

        function begin() {
            if (queuedPromise) return queuedPromise;
            if (!activePromise) return launch();
            if (!disposed) return activePromise;
            queuedPromise = activePromise.catch(function () { }).then(function () {
                queuedPromise = null;
                return launch();
            });
            return queuedPromise;
        }

        function dispose() {
            disposed = true;
            generation += 1;
            safelyCleanup();
        }

        return { start: begin, retry: begin, dispose: dispose, isStarting: function () { return !!activePromise; } };
    }

    return { classifyStartupError: classifyStartupError, createCameraStartup: createCameraStartup };
});
