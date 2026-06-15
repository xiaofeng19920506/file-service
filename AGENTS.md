# file-service

敬拜诗库 monorepo：

- `frontend/` — React Web（`:5173`）
- `backend/api/` — Fastify API（`:3000`）
- `backend/worker/` — BullMQ Worker
- `shared/` — 共享库 + Docker（Postgres / Redis / LibreOffice Worker）

日常开发：`npm run dev:docker`（`shared/docker-compose.yml` 起 DB + Redis，本机跑前后端）。

单独构建：`npm run build:web` / `build:api` / `build:backend` / `build`。

## Git 与 GitHub

完成代码改动并验证（能 build 则 build）后：

1. **直接** `git add`、`git commit`、`git push` 到当前分支的 remote（通常是 `origin/main`）。
2. **不要**询问「是否需要 push」「要不要推送到 GitHub」，也**不要**在回复末尾提醒「需要的话我可以帮你 push」。
3. 用户已多次确认：push 是默认动作，无需每次确认。
4. **仅当**用户明确说「不要 push」「先别提交」「不要 commit」时，才跳过提交或推送。
5. 不要提交 `.env`、密钥等敏感文件；push 前检查 `git status`。
6. commit message 简洁说明「为什么」，遵循仓库既有风格（`feat:` / `fix:` 等）。
