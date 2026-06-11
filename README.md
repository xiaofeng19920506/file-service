# file-service · 敬拜诗库

演示文稿上传、诗库管理、合并与编辑的 monorepo 应用。

## 存储后端

通过 `STORAGE_BACKEND` 选择：

| 值 | 说明 |
|----|------|
| **`fs`** | **纯本地目录**（默认 Docker 编排）。设置 `LOCAL_STORAGE_DIR`，blob 与导出文件以相对路径键写入该根目录。API 下载时直接流式输出文件，不经过预签名 URL。 |
| **`s3`** | S3 兼容协议（AWS S3、**MinIO** 等）。需配置 `S3_ENDPOINT`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_BUCKET` 等；下载走临时预签名链接重定向。 |

API 与 Worker **必须使用同一种后端**，并访问**同一份**存储根（本机目录需路径一致；Docker 下请挂载同一 volume）。

## 结构

- `packages/shared`：Postgres（Drizzle）、**统一对象存储抽象**（`FsObjectStorage` / `S3ObjectStorage`）、环境变量、下载令牌
- `apps/api`：Fastify 后端 — 上传、`POST /v1/jobs`、任务状态、下载（fs 为流式响应，s3 为 302）
- `apps/worker`：BullMQ — 读存储、LibreOffice 转换、合并、写回存储、定时清理过期导出
- `apps/web`：React 前端 — 文件上传、排序、合并任务与下载

## 日常开发（推荐·轻量）

Docker **只跑 Postgres + Redis**（约几十 MB），API / Worker / Web 在本机运行。**直接上传 `.pptx` 即可**，无需 LibreOffice、不会卡死。

```bash
npm run dev:docker
# 等价于：docker compose up -d postgres redis && npm run dev
```

浏览器打开 **http://localhost:5173**。

| 格式 | 轻量模式 |
|------|----------|
| `.pptx` | 预览、编辑、合并均可 |
| `.ppt` / `.odp` | 需本机安装 LibreOffice，或先转为 `.pptx` |

```bash
npm run dev:status   # 查看状态
npm run dev:stop     # 停止 Docker full 栈（若曾启用）
```

### 高内存全 Docker（不推荐）

仅在机器内存充足（建议 16GB+）且无法本机安装 LibreOffice 时使用：

```bash
npm run dev:docker:full
```

会构建含 LibreOffice 的 Worker 容器（约 1.5GB+ 内存），低配置 Mac 容易卡死。

## 手动启动

1. 启动 Postgres + Redis：

   ```bash
   docker compose up -d postgres redis
   ```

2. 安装与构建：

   ```bash
   npm install
   npm run build
   ```

3. 配置环境：复制 `.env.example`，设置 `STORAGE_BACKEND=fs` 与 `LOCAL_STORAGE_DIR`（例如 `./data/storage`）。API 与 Worker 的 `LOCAL_STORAGE_DIR` 必须指向同一目录。

4. 本机安装 LibreOffice（API 预览与 Worker 合并均调 `soffice`）。macOS：`brew install --cask libreoffice`，必要时设置 `SOFFICE_PATH`。

5. 一键启动前后端（需已配置 `.env`）：

   ```bash
   npm run dev
   ```

   或分别在三个终端启动 `npm run dev:api`、`npm run dev:worker`、`npm run dev:web`。

   浏览器打开 **http://localhost:5173** 使用前端界面。API 在 `http://localhost:3000`，开发时 Vite 会将 `/v1` 代理到 API。

## HTTP 流程（摘要）

1. `POST /v1/uploads` — `multipart` 单文件；响应 `blobId`、`sha256`、`deduplicated`
2. `POST /v1/jobs` — `{ "inputs": [{ "blobId": "...", "order": 0 }] }`；响应 `jobId`
3. `GET /v1/jobs/:id` — `queued` → `running` → `succeeded` / `failed`
4. `POST /v1/jobs/:id/download-url` — 成功返回带 HMAC 的下载 URL（建议设置 `PUBLIC_BASE_URL` 生成绝对地址）
5. `GET /v1/jobs/:id/download?token=...` — **`fs`**：直接返回文件流；**`s3`**：302 到预签名 GET

## 生产部署

```bash
npm run prod:docker
```

使用 `docker-compose.prod.yml` 构建 API（含前端静态资源）与 Worker（含 LibreOffice）。
