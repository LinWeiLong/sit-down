# Sit Down Demo

这是一个公开的浏览器 Demo，用于展示本地姿态识别、摄像头权限、校准和语音提醒等基础能力。

运行时资源都在仓库内，本页面可以作为纯静态站点发布到 GitHub Pages，不依赖服务端或 CDN。

## 本地开发

```bash
npm run verify
npm run build:web
```

如果当前 shell 没有 npm，可以直接用 Node 运行：

```bash
node scripts/check-project.mjs
node --test tests/*.test.cjs
node scripts/build-web.mjs
```

## 隐私说明

Demo 的视频帧和姿态关键点只在浏览器本地内存中处理，不上传、不录像、不保存。

## 私有内容

详细产品规划、治理文档和移动端工程保存在本机 `app-private/` 独立 git 仓库中；该目录已被公开仓库忽略，不应推送到公开仓库。
