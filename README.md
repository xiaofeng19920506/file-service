# file-service · 敬拜诗库

演示文稿上传、诗库管理、合并与编辑（前后端分离 monorepo）。

## 目录结构

```
frontend/          React 前端（:5173）
backend/
  api/             Fastify API（:3000）
  worker/          BullMQ 合并任务
shared/            共享库 + Docker（Postgres / Redis / LibreOffice Worker）
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

Docker **只跑 Postgres + Redis**（配置在 `shared/docker-compose.yml`），其余本机运行：

```bash
npm run dev:docker
```

浏览器打开 **http://localhost:5173**。

无法本机安装 LibreOffice 时：

```bash
npm run dev:docker:libre
```

Docker 跑 Postgres + Redis + Worker；本机只跑 API + Web。

## 手动启动

```bash
docker compose -f shared/docker-compose.yml up -d postgres redis
npm install && npm run build
cp .env.example .env   # 按需修改
npm run dev
```

## 生产部署

1. **后端**：`npm run build:backend`，运行 API + Worker；数据库可用 `docker compose -f shared/docker-compose.yml up -d postgres redis`
2. **前端**：`VITE_API_URL=https://api.example.com npm run build:web`，部署 `frontend/dist`
3. 后端设置 `CORS_ORIGIN`、`WEB_APP_URL` 为前端域名

环境变量见 [.env.example](.env.example)。
