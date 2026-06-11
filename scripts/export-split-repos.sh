#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_OUT="${1:-$ROOT/../file-service-backend}"
FRONTEND_OUT="${2:-$ROOT/../file-service-frontend}"

echo "==> Export backend repo -> $BACKEND_OUT"
rm -rf "$BACKEND_OUT"
mkdir -p "$BACKEND_OUT"/{packages,apps,docker,scripts,.github/workflows}

rsync -a "$ROOT/packages/shared/" "$BACKEND_OUT/packages/shared/"
rsync -a "$ROOT/apps/api/" "$BACKEND_OUT/apps/api/"
rsync -a "$ROOT/apps/worker/" "$BACKEND_OUT/apps/worker/"
rsync -a "$ROOT/docker/Dockerfile.api" "$BACKEND_OUT/docker/"
rsync -a "$ROOT/docker/Dockerfile.worker" "$BACKEND_OUT/docker/"
rsync -a "$ROOT/docker/init-db.sql" "$BACKEND_OUT/docker/"
rsync -a "$ROOT/docker/migrations/" "$BACKEND_OUT/docker/migrations/" 2>/dev/null || true
rsync -a "$ROOT/scripts/dev-mode.sh" "$BACKEND_OUT/scripts/"
rsync -a "$ROOT/scripts/prod.sh" "$BACKEND_OUT/scripts/"
cp "$ROOT/tsconfig.base.json" "$BACKEND_OUT/"
cp "$ROOT/docker-compose.yml" "$BACKEND_OUT/"
cp "$ROOT/docker-compose.backend.prod.yml" "$BACKEND_OUT/docker-compose.prod.yml"
cp "$ROOT/.gitignore" "$BACKEND_OUT/"

cat > "$BACKEND_OUT/package.json" <<'EOF'
{
  "name": "file-service-backend",
  "private": true,
  "type": "module",
  "workspaces": ["packages/*", "apps/*"],
  "scripts": {
    "build": "npm run build -w @file-service/shared && npm run build -w @file-service/api && npm run build -w @file-service/worker",
    "dev": "concurrently -k -n api,worker -c blue,green \"tsx watch apps/api/src/index.ts\" \"tsx watch apps/worker/src/index.ts\"",
    "dev:api": "tsx watch apps/api/src/index.ts",
    "dev:worker": "tsx watch apps/worker/src/index.ts",
    "dev:docker": "docker compose up -d postgres redis",
    "start": "node apps/api/dist/index.js",
    "prod:docker": "docker compose -f docker-compose.prod.yml up --build -d",
    "prod:docker:down": "docker compose -f docker-compose.prod.yml down",
    "db:generate": "npm run db:generate -w @file-service/shared",
    "db:migrate": "npm run db:migrate -w @file-service/shared",
    "db:migrate:run": "npm run db:migrate:run -w @file-service/shared"
  },
  "devDependencies": {
    "concurrently": "^9.1.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
EOF

node -e "
const fs = require('fs');
const path = '$BACKEND_OUT/apps/api/tsconfig.json';
const ts = JSON.parse(fs.readFileSync(path, 'utf8'));
ts.exclude = ['src/**/*.test.ts'];
fs.writeFileSync(path, JSON.stringify(ts, null, 2) + '\n');
"

cat > "$BACKEND_OUT/.env.example" <<'EOF'
DATABASE_URL=postgresql://fileservice:fileservice@localhost:5432/fileservice
REDIS_URL=redis://localhost:6379
STORAGE_BACKEND=fs
LOCAL_STORAGE_DIR=./data/storage

PORT=3000
# 前端部署地址（CORS + 分享邮件链接），逗号分隔
CORS_ORIGIN=http://localhost:8080
WEB_APP_URL=http://localhost:8080

MAX_UPLOAD_MB=200
DOWNLOAD_HMAC_SECRET=replace-with-at-least-16-chars
DOWNLOAD_URL_TTL_SECONDS=3600
PUBLIC_BASE_URL=http://localhost:3000

SOFFICE_PATH=soffice
WORKER_CONCURRENCY=1
RUN_MIGRATIONS=1

RATE_LIMIT_MAX=120
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_UPLOAD_MAX=30

# YOUTUBE_API_KEY=
# SMTP_HOST= SMTP_PORT=587 SMTP_USER= SMTP_PASS= SMTP_FROM=
# SHARE_LINK_TTL_SECONDS=604800
EOF

cat > "$BACKEND_OUT/README.md" <<'EOF'
# file-service-backend

敬拜诗库 API + Worker（从 monorepo 导出）。

## 开发

```bash
cp .env.example .env
npm install
npm run dev:docker
npm run build -w @file-service/shared
npm run dev
```

API 默认 `http://localhost:3000`。请配合独立部署的前端，并设置 `CORS_ORIGIN` 为前端地址。

## 生产 Docker

```bash
cp .env.example .env
# 编辑 CORS_ORIGIN、WEB_APP_URL、PUBLIC_BASE_URL、DOWNLOAD_HMAC_SECRET 等
npm run prod:docker
```

包含：Postgres、Redis、API、Worker（**不含前端**）。

## 环境变量要点

| 变量 | 说明 |
|------|------|
| `CORS_ORIGIN` | 允许的前端 Origin |
| `WEB_APP_URL` | 分享邮件中的前端链接 |
| `PUBLIC_BASE_URL` | API 对外地址（下载链接） |
EOF

cat > "$BACKEND_OUT/.github/workflows/ci.yml" <<'EOF'
name: CI

on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm install
      - run: npm run build
      - run: docker build -f docker/Dockerfile.api -t file-service-api:ci .
EOF

echo "==> Export frontend repo -> $FRONTEND_OUT"
rm -rf "$FRONTEND_OUT"
mkdir -p "$FRONTEND_OUT"/{docker,.github/workflows}

rsync -a "$ROOT/apps/web/" "$FRONTEND_OUT/" \
  --exclude node_modules \
  --exclude dist

cp "$ROOT/docker/Dockerfile.web" "$FRONTEND_OUT/docker/"
cp "$ROOT/docker/nginx.web.conf" "$FRONTEND_OUT/docker/"
cp "$ROOT/docker-compose.frontend.prod.yml" "$FRONTEND_OUT/docker-compose.prod.yml"
cp "$ROOT/apps/web/vercel.json" "$FRONTEND_OUT/vercel.json"
cp "$ROOT/.gitignore" "$FRONTEND_OUT/"

# Flatten package name for standalone repo
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$FRONTEND_OUT/package.json', 'utf8'));
pkg.name = 'file-service-frontend';
pkg.devDependencies = pkg.devDependencies || {};
pkg.devDependencies['@types/node'] = '^22.10.2';
const tsApp = JSON.parse(fs.readFileSync('$FRONTEND_OUT/tsconfig.app.json', 'utf8'));
tsApp.exclude = [...(tsApp.exclude || []), 'src/**/*.test.ts'];
fs.writeFileSync('$FRONTEND_OUT/tsconfig.app.json', JSON.stringify(tsApp, null, 2) + '\n');
fs.writeFileSync('$FRONTEND_OUT/package.json', JSON.stringify(pkg, null, 2) + '\n');
"

cat > "$FRONTEND_OUT/.env.example" <<'EOF'
# 后端 API 地址（生产必填，如 https://api.example.com）
# 本地开发可留空，Vite 会代理 /v1 到 localhost:3000
VITE_API_URL=

# 可选：与后端 API_KEY 相同
# VITE_API_KEY=
EOF

cat > "$FRONTEND_OUT/vite.config.ts" <<'EOF'
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_DEV_API_PROXY || 'http://localhost:3000';

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/v1': apiTarget,
        '/health': apiTarget,
      },
    },
  };
});
EOF

cat > "$FRONTEND_OUT/README.md" <<'EOF'
# file-service-frontend

敬拜诗库 Web 前端（从 monorepo 导出）。

## 开发

```bash
cp .env.example .env
npm install
npm run dev
```

默认 `http://localhost:5173`，`/v1` 代理到 `http://localhost:3000`（需后端 API 已启动）。

## 生产构建

```bash
VITE_API_URL=https://api.example.com npm run build
```

构建产物在 `dist/`，可部署到任意静态托管（Nginx、Cloudflare Pages、S3 等）。

## Docker

```bash
VITE_API_URL=https://api.example.com docker compose -f docker-compose.prod.yml up --build -d
```

默认映射 `8080` 端口。

## 环境变量

| 变量 | 说明 |
|------|------|
| `VITE_API_URL` | 生产环境后端 API 基址 |
| `VITE_API_KEY` | 可选 API Key |
| `VITE_DEV_API_PROXY` | 开发时代理目标，默认 `http://localhost:3000` |
EOF

cat > "$FRONTEND_OUT/.github/workflows/ci.yml" <<'EOF'
name: CI

on:
  push:
    branches: [main, master]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm install
      - run: npm run build
      - run: docker build -f docker/Dockerfile.web -t file-service-web:ci .
EOF

echo ""
echo "Done."
echo "  Backend:  $BACKEND_OUT"
echo "  Frontend: $FRONTEND_OUT"
echo ""
echo "Next steps:"
echo "  cd $BACKEND_OUT && npm install && git init"
echo "  cd $FRONTEND_OUT && npm install && git init"
