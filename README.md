# file-service

Node.js monorepo：上传演示文稿（按内容 SHA-256 去重）、排队合并为单个 `.pptx`、带签名下载与 7 天导出清理。合并使用 [pptx-automizer](https://github.com/singerla/pptx-automizer)；`.ppt` / `.pps` / `.pot` / `.odp` 等由 **LibreOffice** 先转为 `.pptx`。

## 存储后端

通过 `STORAGE_BACKEND` 选择：

| 值 | 说明 |
|----|------|
| **`fs`** | **纯本地目录**（默认 Docker 编排）。设置 `LOCAL_STORAGE_DIR`，blob 与导出文件以相对路径键写入该根目录。API 下载时直接流式输出文件，不经过预签名 URL。 |
| **`s3`** | S3 兼容协议（AWS S3、**MinIO** 等）。需配置 `S3_ENDPOINT`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_BUCKET` 等；下载走临时预签名链接重定向。 |

API 与 Worker **必须使用同一种后端**，并访问**同一份**存储根（本机目录需路径一致；Docker 下请挂载同一 volume）。

## 结构

- `packages/shared`：Postgres（Drizzle）、**统一对象存储抽象**（`FsObjectStorage` / `S3ObjectStorage`）、环境变量、下载令牌
- `apps/api`：Fastify — 上传、`POST /v1/jobs`、任务状态、下载（fs 为流式响应，s3 为 302）
- `apps/worker`：BullMQ — 读存储、LibreOffice 转换、合并、写回存储、定时清理过期导出

## 本地开发（本地目录）

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

4. 本机安装 LibreOffice（Worker 调 `soffice`）。macOS：`brew install --cask libreoffice`，必要时设置 `SOFFICE_PATH`。

5. 分别启动：

   ```bash
   npm run dev:api
   npm run dev:worker
   ```

## HTTP 流程（摘要）

1. `POST /v1/uploads` — `multipart` 单文件；响应 `blobId`、`sha256`、`deduplicated`
2. `POST /v1/jobs` — `{ "inputs": [{ "blobId": "...", "order": 0 }] }`；响应 `jobId`
3. `GET /v1/jobs/:id` — `queued` → `running` → `succeeded` / `failed`
4. `POST /v1/jobs/:id/download-url` — 成功返回带 HMAC 的下载 URL（建议设置 `PUBLIC_BASE_URL` 生成绝对地址）
5. `GET /v1/jobs/:id/download?token=...` — **`fs`**：直接返回文件流；**`s3`**：302 到预签名 GET

## Docker 全栈（默认本地卷）

```bash
docker compose up --build
```

使用命名卷 `file_storage` 挂载到 API 与 Worker 的 `/data/storage`，无需 MinIO。生产环境请修改 `DOWNLOAD_HMAC_SECRET`，并为 API 配置 HTTPS 与可信的 `PUBLIC_BASE_URL`。

若仍希望使用 MinIO：将 `STORAGE_BACKEND` 改为 `s3`，并自行在编排中加入 MinIO 服务与服务间网络配置（与此前 S3 模式相同）。

## 限制说明

- pptx-automizer 对动画、部分音视频与复杂母版有限制，见上游文档。
- 极大文件请调大 `MAX_UPLOAD_MB` 与反向代理限制。
- Worker `concurrency` 当前为 1，可按机器资源与 LibreOffice 稳定性调高。
