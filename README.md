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

### 前端（Vercel）

- **Root Directory**：`frontend`
- **Output Directory**：`dist`（由 `frontend/vercel.json` 配置）
- 环境变量：`VITE_API_URL` = 后端 API 地址

### 后端（Vercel）

- **Root Directory**：`backend/api`（不是 `backend`，也不是仓库根目录）
- **不要**设置 Output Directory（后端是 Fastify，不是静态站点；若 Dashboard 里填了 `dist` 会报错）
- **Framework Preset**：Other（`backend/api/vercel.json` 已设 `framework: null`）
- 构建与安装由 `backend/api/vercel.json` 从 monorepo 根目录执行 `npm run build:api`

**Vercel 环境变量（必填示例）**：

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
STORAGE_BACKEND=s3          # Vercel 上不要用 fs，文件系统是临时的
S3_BUCKET=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
DOWNLOAD_HMAC_SECRET=...
CORS_ORIGIN=https://你的前端.vercel.app
PUBLIC_BASE_URL=https://你的API.vercel.app
```

**注意**：Vercel 只跑 API；**Worker（合并任务）和 LibreOffice 需另部署**（本机、Railway、家里 Docker 等），并共用同一 `DATABASE_URL`、`REDIS_URL`、S3。

### 本机 / 自建服务器

1. **后端**：`npm run build:backend`，运行 API + Worker；数据库可用 `docker compose -f shared/docker-compose.yml up -d postgres redis`
2. **前端**：`VITE_API_URL=https://api.example.com npm run build:web`，部署 `frontend/dist`
3. 后端设置 `CORS_ORIGIN`、`WEB_APP_URL` 为前端域名

环境变量见 [.env.example](.env.example)。
