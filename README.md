# Sit Down - 坐姿矫正提醒

基于 [MediaPipe Pose](https://google.github.io/mediapipe/solutions/pose.html) 的实时坐姿检测与提醒工具，纯前端实现，无需后端服务。

## 功能

- 实时检测低头、歪头、收下巴等不良坐姿
- 校准机制：以你自己的标准姿势为基准，自适应不同身材和距离
- 语音提醒：坐姿错误 2 秒后语音提示，持续错误每 10 秒重复提醒
- 动物贴纸遮脸：保护隐私，10 种动物表情可切换
- 敏感度可调：低头/歪头/收下巴阈值自由设置
- 移动端适配：手机浏览器可直接使用

## 使用方法

1. 用 Chrome/Edge 浏览器打开页面
2. 点击"开始坐姿检测"，允许摄像头权限
3. 保持标准坐姿，点击"校准"按钮
4. 倒计时 3 秒后开始采集基准数据
5. 校准完成后自动进入检测模式

## 技术栈

- [MediaPipe Pose](https://google.github.io/mediapipe/solutions/pose.html) - 人体姿态识别
- Web Speech API - 语音播报
- Web Audio API - 校准提示音
- Canvas API - 视频渲染与骨骼绘制

## 本地运行

由于浏览器安全限制，摄像头访问需要 HTTPS 或 localhost。本地开发可用：

```bash
# Python 3
python -m http.server 8080

# 然后访问 http://localhost:8080
```

手机访问需 HTTPS，可用 OpenSSL 自签名证书：

```bash
openssl req -newkey rsa:2048 -new -nodes -x509 -days 3650 -keyout key.pem -out cert.pem
python -c "
import http.server, ssl
server = http.server.HTTPServer(('0.0.0.0', 8443), http.server.SimpleHTTPRequestHandler)
server.socket = ssl.wrap_socket(server.socket, keyfile='key.pem', certfile='cert.pem', server_side=True)
server.serve_forever()
"
```

## 部署

推荐部署到 [GitHub Pages](https://pages.github.com/)，自带 HTTPS，手机可直接访问。

## License

MIT
