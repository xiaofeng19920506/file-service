#!/usr/bin/env bash
# 安全重启本机 Web（:4000）：杀光 next build/dev，清 .next，只起一个实例。
# next build 与 next dev 抢同一 .next → ENOENT → Internal Server Error。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-4000}"
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:3000}"

info() { echo "==> $*"; }

info "停止所有 next（build / dev / server）与占用 ${PORT} 的进程…"
pkill -f "next build" >/dev/null 2>&1 || true
pkill -f "next dev" >/dev/null 2>&1 || true
pkill -f "next-server" >/dev/null 2>&1 || true
sleep 1
PIDS="$(lsof -iTCP:"${PORT}" -sTCP:LISTEN -t 2>/dev/null || true)"
if [[ -n "${PIDS}" ]]; then
  # shellcheck disable=SC2086
  kill ${PIDS} >/dev/null 2>&1 || true
  sleep 1
fi

info "清理 frontend/.next …"
rm -rf frontend/.next

info "启动 Web :${PORT}（BACKEND_URL=${BACKEND_URL}）…"
cd frontend
set -e
exec env PORT="${PORT}" BACKEND_URL="${BACKEND_URL}" npm run dev
