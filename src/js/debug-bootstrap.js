(function () {
    var params = new URLSearchParams(window.location.search);
    var enabled = params.get('debug') === '1' || params.get('vconsole') === '1';
    window.__SIT_DOWN_DEBUG__ = enabled;
    window.__sitDownDebugLog = function () {
        if (!window.__SIT_DOWN_DEBUG__ || !window.console || !console.log) return;
        console.log.apply(console, arguments);
    };

    if (!enabled) return;

    document.write('<script src="./vendor/vconsole/vconsole.min.js"><\/script>');
    document.write('<script>(function(){window.__sitDownVConsole=new window.VConsole();console.log("[sit-down] vConsole enabled", location.href);window.addEventListener("error",function(event){console.error("[sit-down] window error", event.message, event.filename, event.lineno, event.colno, event.error);});window.addEventListener("unhandledrejection",function(event){console.error("[sit-down] unhandled rejection", event.reason);});})();<\/script>');
})();