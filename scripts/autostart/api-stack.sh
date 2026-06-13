#!/usr/bin/env bash
# 启动 file-service：Docker(Postgres+Redis) + API + Worker
# 手动：bash scripts/autostart/api-stack.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -n "${FILE_SERVICE_REPO:-}" ]]; then
  ROOT="$FILE_SERVICE_REPO"
  LOG_FILE="${FILE_SERVICE_LOG:-${HOME}/Library/Application Support/com.fileservice/api-stack.log}"
else
  ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
  LOG_FILE="${ROOT}/data/autostart/api-stack.log"
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

COMPOSE=(docker compose -f "${ROOT}/shared/docker-compose.yml")

wait_for_docker() {
  local i
  for i in $(seq 1 90); do
    if docker info >/dev/null 2>&1; then
      log "Docker 已就绪"
      return 0
    fi
    log "等待 Docker… (${i}/90)"
    sleep 2
  done
  log "Docker 未就绪，请在系统设置中开启「登录时打开 Docker Desktop」"
  return 1
}

wait_for_postgres() {
  local i
  for i in $(seq 1 45); do
    if "${COMPOSE[@]}" exec -T postgres pg_isready -U fileservice >/dev/null 2>&1; then
      log "Postgres 已就绪"
      return 0
    fi
    sleep 2
  done
  log "Postgres 启动超时"
  return 1
}

wait_for_docker

log "启动 Postgres + Redis"
"${COMPOSE[@]}" up -d postgres redis
wait_for_postgres

TSX="${ROOT}/node_modules/.bin/tsx"
CONCURRENTLY="${ROOT}/node_modules/.bin/concurrently"
if [[ ! -x "$TSX" ]] || [[ ! -x "$CONCURRENTLY" ]]; then
  log "缺少 node_modules，请在 ${ROOT} 执行 npm install"
  exit 1
fi

log "启动 API + Worker（端口 ${PORT:-3000}）"
exec "$CONCURRENTLY" -k \
  "cd '${ROOT}' && '$TSX' backend/api/src/index.ts" \
  "cd '${ROOT}' && '$TSX' backend/worker/src/index.ts" \
  >> "$LOG_FILE" 2>&1
