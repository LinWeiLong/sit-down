import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'index.html',
  'sw.js',
  'src/styles/app.css',
  'src/js/posture-math.js',
  'src/js/session-model.js',
  'src/js/app.js',
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
if (/<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(html)) {
  throw new Error('Runtime CDN references are not allowed in index.html');
}

for (const path of ['src/styles/app.css', 'src/js/debug-bootstrap.js', 'src/js/posture-math.js', 'src/js/session-model.js', 'src/js/app.js']) {
  if (!html.includes(path)) throw new Error('index.html is missing runtime asset: ' + path);
}

const sw = await readFile('sw.js', 'utf8');
if (!sw.includes("pathname.includes('/vendor/mediapipe/')")) {
  throw new Error('Service worker must bypass MediaPipe runtime assets to avoid mobile wasm/model initialization stalls.');
}
for (const path of ['src/styles/app.css', 'src/js/debug-bootstrap.js', 'vendor/vconsole/vconsole.min.js', 'src/js/posture-math.js', 'src/js/session-model.js', 'src/js/app.js']) {
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

const app = await readFile('src/js/app.js', 'utf8');
if (/animalFaces|animalBtn/.test(app)) throw new Error('Focus demo must not keep child-attracting animal overlay controls.');
if (!app.includes('模型还在加载') || !app.includes('calibration ignored before first pose results')) {
  throw new Error('Calibration button must explain when MediaPipe has not produced the first result yet.');
}
if (!app.includes('lastReliablePoseAt') || !app.includes('calibration ignored before reliable pose')) {
  throw new Error('Calibration button must require a recent reliable pose before starting calibration.');
}
if (!app.includes('cancelCalibrationWithMessage') || !app.includes('CALIBRATION_FAILED')) {
  throw new Error('Calibration must recover when reliable samples cannot be collected.');
}

console.log('Public demo structure and local runtime assets are valid.');
