#!/usr/bin/env bash
# 启动 file-service 前端：Next.js 生产模式（默认 :4000，代理到本机 API）
# 手动：bash scripts/autostart/web-stack.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -n "${FILE_SERVICE_REPO:-}" ]]; then
  ROOT="$FILE_SERVICE_REPO"
  LOG_FILE="${FILE_SERVICE_LOG:-${HOME}/Library/Application Support/com.fileservice/web-stack.log}"
else
  ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
  LOG_FILE="${ROOT}/data/autostart/web-stack.log"
fi

cd "$ROOT"
mkdir -p "$(dirname "$LOG_FILE")"

export PATH="/opt/homebrew/bin:/usr/local/bin:${PATH:-/usr/bin:/bin}"

log() {
  echo "$(date -Iseconds) $*" | tee -a "$LOG_FILE"
}

ENV_FILE="${FILE_SERVICE_ENV:-${ROOT}/.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
elif [[ -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
fi

WEB_PORT="${FILE_SERVICE_WEB_PORT:-4000}"
BACKEND_URL="${FILE_SERVICE_BACKEND_URL:-http://127.0.0.1:3000}"
API_PORT="${PORT:-3000}"

wait_for_api() {
  local i
  for i in $(seq 1 60); do
    if curl -sf --connect-timeout 2 "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
      log "API :${API_PORT} 已就绪"
      return 0
    fi
    log "等待 API :${API_PORT}… (${i}/60)"
    sleep 2
  done
  log "API :${API_PORT} 未响应，仍尝试启动前端"
  return 0
}

ensure_web_build() {
  local build_id="${ROOT}/frontend/.next/BUILD_ID"
  local stamp_file="${ROOT}/data/autostart/web-build-head"
  local current_head=""
  if command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse HEAD >/dev/null 2>&1; then
    current_head="$(git -C "$ROOT" rev-parse HEAD)"
  fi

  local needs_rebuild=0
  if [[ "${FILE_SERVICE_WEB_REBUILD:-}" == "1" ]]; then
    needs_rebuild=1
  elif [[ ! -f "$build_id" ]]; then
    needs_rebuild=1
  elif [[ -n "$current_head" && -f "$stamp_file" && "$(cat "$stamp_file")" != "$current_head" ]]; then
    needs_rebuild=1
  elif [[ -n "$current_head" && ! -f "$stamp_file" ]]; then
    needs_rebuild=1
  fi

  if [[ "$needs_rebuild" == "0" ]]; then
    log "使用已有前端构建（${build_id}）"
    return 0
  fi

  if [[ ! -x "${ROOT}/node_modules/.bin/next" ]]; then
    log "缺少 node_modules，请在 ${ROOT} 执行 npm install"
    exit 1
  fi

  log "构建前端（BACKEND_URL=${BACKEND_URL}）"
  BACKEND_URL="$BACKEND_URL" npm run build:web >> "$LOG_FILE" 2>&1
  if [[ -n "$current_head" ]]; then
    mkdir -p "$(dirname "$stamp_file")"
    printf '%s' "$current_head" > "$stamp_file"
  fi
}

wait_for_api
ensure_web_build

log "启动 Next.js（端口 ${WEB_PORT} → API ${BACKEND_URL}）"
cd "${ROOT}/frontend"
export PORT="$WEB_PORT"
exec npm start >> "$LOG_FILE" 2>&1
