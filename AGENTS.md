# file-service

敬拜诗库 monorepo：

- `frontend/` — React Web（`:5173`）
- `backend/api/` — Fastify API（`:3000`）
- `backend/worker/` — BullMQ Worker
- `shared/` — 共享库 + Docker（Postgres / Redis / LibreOffice Worker）

日常开发：`npm run dev:docker`（`shared/docker-compose.yml` 起 DB + Redis，本机跑前后端）。

单独构建：`npm run build:web` / `build:api` / `build:backend` / `build`。
