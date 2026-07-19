import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'index.html',
  'demo.html',
  'sw.js',
  'src/styles/app.css',
  'src/js/posture-math.js',
  'src/js/session-model.js',
  'src/js/camera-startup.js',
  'src/js/demo-app.js',
  'src/js/debug-bootstrap.js',
  'vendor/vconsole/vconsole.min.js',
  'scripts/build-web.mjs',
  'vendor/mediapipe/pose/pose.js',
  'vendor/mediapipe/pose/pose_landmark_full.tflite',
  'vendor/mediapipe/pose/pose_web.binarypb',
  'vendor/mediapipe/pose/pose_solution_packed_assets_loader.js',
  'vendor/mediapipe/pose/pose_solution_packed_assets.data',
  'vendor/mediapipe/pose/pose_solution_wasm_bin.js',
  'vendor/mediapipe/pose/pose_solution_wasm_bin.wasm',
  'vendor/mediapipe/pose/pose_solution_simd_wasm_bin.js',
  'vendor/mediapipe/pose/pose_solution_simd_wasm_bin.wasm',
  'vendor/mediapipe/camera_utils/camera_utils.js',
  'vendor/mediapipe/drawing_utils/drawing_utils.js'
];

await Promise.all(requiredFiles.map(path => access(path)));

const html = await readFile('index.html', 'utf8');
const demoHtml = await readFile('demo.html', 'utf8');

if (/<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(html) || /<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(demoHtml)) {
  throw new Error('Runtime CDN references are not allowed in public pages');
}
if (html.includes('vendor/mediapipe') || html.includes('demo-app.js') || html.includes('video id=') || html.includes('canvas id=')) {
  throw new Error('index.html must be a landing page only; camera runtime belongs in demo.html.');
}
if (!html.includes('demo.html')) {
  throw new Error('Landing page must link to demo.html.');
}
if (!demoHtml.includes('vendor/mediapipe/pose/pose.js') || !demoHtml.includes('src/js/demo-app.js')) {
  throw new Error('demo.html must load the local MediaPipe runtime and demo-app.js.');
}
for (const path of ['pose_landmark_full.tflite', 'pose_solution_packed_assets.data', 'pose_solution_simd_wasm_bin.wasm', 'pose_solution_wasm_bin.wasm']) {
  if (!demoHtml.includes(`rel="preload"`) || !demoHtml.includes(path)) {
    throw new Error('demo.html must preload heavy local MediaPipe assets: ' + path);
  }
}
if (!html.includes('src/styles/app.css')) throw new Error('index.html is missing shared stylesheet.');
for (const path of ['src/styles/app.css', 'src/js/debug-bootstrap.js', 'src/js/posture-math.js', 'src/js/session-model.js', 'src/js/camera-startup.js', 'src/js/demo-app.js']) {
  if (!demoHtml.includes(path)) throw new Error('demo.html is missing runtime asset: ' + path);
}

const sw = await readFile('sw.js', 'utf8');
if (!sw.includes("pathname.includes('/vendor/mediapipe/')")) {
  throw new Error('Service worker must bypass MediaPipe runtime assets to avoid mobile wasm/model initialization stalls.');
}
for (const path of ['demo.html', 'src/styles/app.css', 'src/js/debug-bootstrap.js', 'vendor/vconsole/vconsole.min.js', 'src/js/posture-math.js', 'src/js/session-model.js', 'src/js/camera-startup.js', 'src/js/demo-app.js']) {
  if (!sw.includes(path)) throw new Error('Service worker app shell is missing: ' + path);
}

const css = await readFile('src/styles/app.css', 'utf8');
if (/video\s*\{[^}]*display\s*:\s*none\b/is.test(css)) {
  throw new Error('Camera preview video must not be permanently hidden; placement/calibration should show the raw camera feed.');
}

const debugBootstrap = await readFile('src/js/debug-bootstrap.js', 'utf8');
if (!debugBootstrap.includes("params.get('debug')") || !debugBootstrap.includes('vconsole.min.js')) {
  throw new Error('debug-bootstrap must gate local vConsole behind ?debug=1.');
}

const app = await readFile('src/js/demo-app.js', 'utf8');
if (/animalFaces|animalBtn/.test(app)) throw new Error('Focus demo must not keep child-attracting animal overlay controls.');
if (!app.includes('模型还在加载') || !app.includes('calibration ignored before first pose results')) {
  throw new Error('Calibration button must explain when MediaPipe has not produced the first result yet.');
}
if (!app.includes('lastReliablePoseAt') || !app.includes('calibration ignored before reliable pose')) {
  throw new Error('Calibration button must require a recent reliable pose before starting calibration.');
}
if (app.includes('髋部')) {
  throw new Error('Runtime guidance must not require hips in desk upper-body mode.');
}
if (!app.includes('startTrialSession') || !app.includes('settingsToggle')) {
  throw new Error('Runtime must start from trial CTA and keep session settings inside the recognition view.');
}
if (!app.includes('APP_VERSION') || !app.includes('focus preview drawing')) {
  throw new Error('Debug logs must expose app version and focus preview drawing state.');
}
if (!app.includes('resetToPlacementForRecalibration') || !app.includes('clearInterval(sessionTimer)')) {
  throw new Error('Settings must allow restarting placement and calibration after focus starts.');
}
if (!app.includes('renderFocusFeedback') || !app.includes('renderFocusFeedback(classified)') || !app.includes('坐姿很好') || !app.includes('检测到低头')) {
  throw new Error('Focus mode must show live posture feedback instead of silently accumulating data.');
}
if (app.includes('blackoutBtn') || app.includes('黑屏学习')) {
  throw new Error('Public demo must not include blackout mode; focus blackout belongs in the Android app.');
}
if (app.includes("document.hidden && activeSession && activeSession.state === 'focus'")) {
  throw new Error('Visibility changes must not immediately interrupt a focus session in the web demo.');
}
if (/activeSession\.state\s*!==\s*['"]focus['"]\)\s*drawPlacement/.test(app)) {
  throw new Error('Public demo must keep drawing the camera preview during focus sessions.');
}
if (!app.includes('cancelCalibrationWithMessage') || !app.includes('CALIBRATION_FAILED')) {
  throw new Error('Calibration must recover when reliable samples cannot be collected.');
}
if (!app.includes('var ALERT_DELAY_MS = 2000') || !app.includes('var ALERT_COOLDOWN_MS = 10000')) {
  throw new Error('Demo voice alert timing must match the original low-head detection feel.');
}
if (!app.includes('首次加载本地姿态模型可能需要一点时间') || !app.includes('modelComplexity: 1')) {
  throw new Error('Demo must explain first-load model cost and keep modelComplexity at 1.');
}
if (!app.includes('createCameraStartup') || !app.includes('showStartupFailure') || !app.includes('retryStartupBtn') || !app.includes('returnHomeBtn')) {
  throw new Error('Demo must provide guarded startup, retry, and return-home recovery controls.');
}
const startupController = await readFile('src/js/camera-startup.js', 'utf8');
for (const code of ['unsupported', 'insecure-or-policy', 'permission-denied', 'no-camera', 'camera-busy', 'model-failed', 'unknown']) {
  if (!startupController.includes(code)) throw new Error('Startup controller is missing error category: ' + code);
}
if (/enumerateDevices|\.label\b|deviceId|userAgent/i.test(startupController)) {
  throw new Error('Startup controller must not expose camera labels, IDs, or user-agent data.');
}

const postureMath = await readFile('src/js/posture-math.js', 'utf8');
if (!postureMath.includes('headDownRatio: 0.85') || !postureMath.includes('chinDownRatio: 0.7')) {
  throw new Error('Low-head thresholds must stay close to the original demo sensitivity.');
}

console.log('Public landing/demo structure and local runtime assets are valid.');
