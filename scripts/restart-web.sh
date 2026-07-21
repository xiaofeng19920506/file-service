#!/usr/bin/env bash
# 安全重启本机 Web（:4000）：先杀光全部 next，再清 .next，只起一个实例。
# 多个 next 抢同一 .next 会导致 ENOENT → 页面一直 Internal Server Error。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-4000}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"

info() { echo "==> $*"; }

info "停止所有 next / 占用 ${PORT} 的进程…"
pkill -f "next dev" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
sleep 1
if lsof -iTCP:"${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
  kill $(lsof -iTCP:"${PORT}" -sTCP:LISTEN -t) 2>/dev/null || true
  sleep 1
fi

info "清理 frontend/.next …"
rm -rf frontend/.next

info "启动 Web :${PORT}（BACKEND_URL=${BACKEND_URL}）…"
cd frontend
exec env PORT="${PORT}" BACKEND_URL="${BACKEND_URL}" npm run dev
