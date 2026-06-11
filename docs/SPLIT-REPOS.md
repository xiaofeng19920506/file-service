# 前后端拆分为两个 Repo

当前 monorepo 在**运行时**已是前后端分离（Web 仅通过 HTTP 调 API）。拆 repo 主要为了**独立部署与托管**。

## 架构

```
┌──────────────────────┐     HTTPS /v1/*      ┌─────────────────────────────┐
│  file-service-frontend│  ─────────────────►  │  file-service-backend       │
│  (Vite SPA / Nginx)   │     + CORS         │  API + Worker + shared      │
└──────────────────────┘                      └─────────────────────────────┘
         │                                              │
         │ CDN / 静态托管                                │ Postgres + Redis + 存储
```

## 一键导出两个 Repo

在 monorepo 根目录执行：

```bash
bash scripts/export-split-repos.sh
```

默认输出到同级目录：

- `../file-service-backend` — `shared` + `api` + `worker` + Docker + 数据库迁移
- `../file-service-frontend` — 原 `apps/web` 全部内容

自定义路径：

```bash
bash scripts/export-split-repos.sh /path/to/backend /path/to/frontend
```

导出后分别在两个目录：

```bash
npm install
git init
git add . && git commit -m "Initial split from file-service monorepo"
```

## 各 Repo 职责

### Backend (`file-service-backend`)

| 内容 | 说明 |
|------|------|
| `packages/shared` | DB、存储、鉴权、YouTube 字幕等 |
| `apps/api` | Fastify REST API |
| `apps/worker` | BullMQ 合并任务 |
| `docker-compose.prod.yml` | Postgres + Redis + API + Worker |

**不包含**前端静态文件。API 不再打包 `apps/web/dist`。

### Frontend (`file-service-frontend`)

| 内容 | 说明 |
|------|------|
| `src/` | React 应用 |
| `docker/Dockerfile.web` | Nginx 静态镜像 |
| `docker-compose.prod.yml` | 仅 Web 服务 |

通过 `VITE_API_URL` 指向后端。

## 环境变量对照

### 后端 `.env`

```env
CORS_ORIGIN=https://app.example.com
WEB_APP_URL=https://app.example.com
PUBLIC_BASE_URL=https://api.example.com
```

### 前端 `.env`（构建时）

```env
VITE_API_URL=https://api.example.com
```

## 部署方式

### 方式 A：完全分离 + CORS（推荐）

1. **后端**：`docker compose -f docker-compose.prod.yml up -d`（在 backend repo）
2. **前端**：`VITE_API_URL=https://api.example.com npm run build`，部署 `dist/` 到 CDN / Pages
3. 后端设置 `CORS_ORIGIN` 为前端域名

### 方式 B：前端 Docker

```bash
VITE_API_URL=https://api.example.com docker compose -f docker-compose.prod.yml up --build -d
```

### 方式 C：Nginx 反代同源（可选）

在同一域名下：

- `/` → 前端静态
- `/v1/`、`/health`、`/docs` → 后端 API

此时前端构建可留空 `VITE_API_URL`（相对路径）。

## 仍在 Monorepo 内分开部署

不导出 repo 也可先用拆分 compose 验证：

```bash
# 仅后端栈
docker compose -f docker-compose.backend.prod.yml up --build -d

# 仅前端（需指定 API 地址）
VITE_API_URL=http://localhost:3000 docker compose -f docker-compose.frontend.prod.yml up --build -d
```

## 注意事项

1. **类型与权限**：前端 `permissions.ts` 等与 shared 重复维护；长期可用 OpenAPI codegen 或轻量 `contracts` 包。
2. **存储**：API 与 Worker 必须共用同一 `LOCAL_STORAGE_DIR` 或 S3 bucket。
3. **迁移**：只在 backend repo 的 `packages/shared/drizzle` 执行。
4. **原 `docker-compose.prod.yml`**：仍构建「API 内嵌前端」的一体镜像；拆分后请用 `docker-compose.backend.prod.yml` + `docker-compose.frontend.prod.yml`。
