# file-service · MP3 播放列表

登录账号、管理歌单、YouTube 搜索加歌、提取并缓存 MP3 播放（前后端分离 monorepo）。

## 目录结构

```
frontend/          Next.js 前端（播放列表 / 登录 / 管理）
backend/
  api/             Fastify API（:3000）
  worker/          BullMQ Worker（YouTube → MP3）
shared/            共享库 + Docker（Postgres / Redis）
  docker/
  docker-compose.yml
```

## 存储后端

| 值 | 说明 |
|----|------|
| **`fs`** | 本地目录，`LOCAL_STORAGE_DIR`（默认 `./data/storage`） |
| **`s3`** | S3 兼容存储，需配置 `S3_*` 环境变量 |

API 与 Worker 须使用同一存储后端。

### 单独构建

```bash
npm run build:web       # 仅 frontend
npm run build:api       # backend/api（自动先编 shared）
npm run build:worker    # backend/worker
npm run build:backend   # shared + api + worker
npm run build           # 全部
```

## 日常开发

Docker 只跑 Postgres + Redis（`shared/docker-compose.yml`），其余本机运行：

```bash
npm run dev:docker
```

浏览器打开前端（开发常见为 **http://localhost:5173**；本机生产栈为 **:4000**）。

Worker 本机需安装 `yt-dlp` 与 `ffmpeg`（见 `.env.example`）。

## 手动启动

```bash
docker compose -f shared/docker-compose.yml up -d postgres redis
npm install && npm run build
cp .env.example .env   # 按需修改
npm run dev
```

## 生产部署

### 前端（Vercel）

- **Root Directory**：`frontend`
- 环境变量：`BACKEND_URL` = 后端 API 地址

### 后端

- API：`npm run build:api` 后运行 Fastify
- Worker：另进程运行，共用同一 `DATABASE_URL`、`REDIS_URL`、存储后端
- 本机/隧道 Web：`FILE_SERVICE_WEB_REBUILD=1 bash scripts/autostart/web-stack.sh`（`:4000`）

环境变量见 [.env.example](.env.example)。

### 导出到 YouTube（OAuth，可选）

登录用户可将播放列表导出到自己的 YouTube。API 需 HTTPS 回调地址。

**1. Google Cloud Console**

- 启用 [YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
- 创建 OAuth **Web 应用** 客户端
- **已授权的重定向 URI**：`https://你的API域名/v1/youtube/oauth/callback`

**2. API 环境变量**

```env
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
PUBLIC_BASE_URL=https://你的API HTTPS 地址
GOOGLE_OAUTH_REDIRECT_URI=https://你的API HTTPS 地址/v1/youtube/oauth/callback
WEB_APP_URL=https://你的前端地址
```
