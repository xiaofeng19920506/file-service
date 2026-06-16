#!/usr/bin/env bash
# 本机生产栈：一键停止 / 启动全部服务（Docker + API + Worker + Web）
#
# 用法：
#   bash scripts/prod-stack.sh stop          # 停止本机 API/Web 进程
#   bash scripts/prod-stack.sh start         # 迁移 + 启动（使用已有构建）
#   bash scripts/prod-stack.sh start --build # 先 build:prod 再启动
#   MP3_WORKER_COUNT=5 VIDEO_WORKER_COUNT=5 bash scripts/prod-stack.sh start
#   bash scripts/prod-stack.sh status        # 查看端口与容器
#
# npm 快捷：
#   npm run prod:stop
#   npm run prod:start
#   npm run prod:start:build

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f "${ROOT}/shared/docker-compose.yml")
API_PORT="${PORT:-3000}"
WEB_PORT="${FILE_SERVICE_WEB_PORT:-4000}"
MP3_WORKER_COUNT="${MP3_WORKER_COUNT:-5}"
VIDEO_WORKER_COUNT="${VIDEO_WORKER_COUNT:-5}"
CONCURRENTLY="${ROOT}/node_modules/.bin/concurrently"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${BLUE}==>${NC} $*"; }
warn() { echo -e "${YELLOW}!!>${NC} $*"; }
ok() { echo -e "${GREEN} ok${NC} $*"; }

usage() {
  cat <<EOF
用法: bash scripts/prod-stack.sh <stop|start|status> [--build]

  stop              停止本机 API / Worker / Web（:3000 :4000 :5173）
  start [--build]   启动 Docker + 迁移 + API + 1 合并 Worker + 5 音频 + 5 视频 + Web
                    可用 MP3_WORKER_COUNT / VIDEO_WORKER_COUNT 覆盖默认 5
  status            查看 Docker 容器与端口占用

示例：
  bash scripts/prod-stack.sh stop
  bash scripts/prod-stack.sh start --build
EOF
}

need_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "未找到 docker，请先安装并启动 Docker Desktop。" >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker 未运行，请先启动 Docker Desktop。" >&2
    exit 1
  fi
}

load_env() {
  if [[ ! -f "${ROOT}/.env" ]]; then
    echo "缺少 ${ROOT}/.env，请先复制 .env.example 并配置。" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
  export SOFFICE_PREVIEW_URL="${SOFFICE_PREVIEW_URL:-http://localhost:3010}"
}

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti ":${port}" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    warn "释放端口 :${port}（PID: $(echo "$pids" | tr '\n' ' ')）"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

stop_launchagents() {
  local gui="gui/$(id -u)"
  local api_plist="${HOME}/Library/LaunchAgents/com.fileservice.api-stack.plist"
  local web_plist="${HOME}/Library/LaunchAgents/com.fileservice.web.plist"
  if [[ -f "$api_plist" ]]; then
    launchctl bootout "$gui" "$api_plist" 2>/dev/null || true
  fi
  if [[ -f "$web_plist" ]]; then
    launchctl bootout "$gui" "$web_plist" 2>/dev/null || true
  fi
}

stop_local_processes() {
  stop_launchagents

  pkill -f "${ROOT}/backend/api/dist/index.js" 2>/dev/null || true
  pkill -f "${ROOT}/backend/worker/dist/index.js" 2>/dev/null || true
  pkill -f "${ROOT}/backend/worker/dist/worker-audio.js" 2>/dev/null || true
  pkill -f "${ROOT}/backend/worker/dist/worker-video.js" 2>/dev/null || true
  pkill -f "${ROOT}/backend/worker/dist/worker-merge.js" 2>/dev/null || true
  pkill -f "${ROOT}/backend/api/src/index.ts" 2>/dev/null || true
  pkill -f "${ROOT}/backend/worker/src/" 2>/dev/null || true
  pkill -f "${ROOT}/node_modules/.bin/tsx watch backend/" 2>/dev/null || true
  pkill -f "${ROOT}/node_modules/.bin/concurrently" 2>/dev/null || true
  pkill -f "${ROOT}/frontend/.next" 2>/dev/null || true

  free_port "$API_PORT"
  free_port "$WEB_PORT"
  free_port 5173
}

cmd_stop() {
  info "停止 file-service 本机进程…"
  stop_local_processes
  ok "已停止 API :${API_PORT} / Web :${WEB_PORT} / Dev :5173"
  echo "Docker 容器（Postgres / Redis / LibreOffice）仍在运行；要停容器请执行："
  echo "  docker compose -f shared/docker-compose.yml down"
}

wait_for_postgres() {
  local i
  for i in $(seq 1 45); do
    if "${COMPOSE[@]}" exec -T postgres pg_isready -U fileservice >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "Postgres 启动超时" >&2
  return 1
}

wait_for_api() {
  local i
  for i in $(seq 1 60); do
    if curl -sf --connect-timeout 2 "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "API :${API_PORT} 启动超时" >&2
  return 1
}

ensure_build() {
  local missing=0
  for f in \
    "${ROOT}/backend/api/dist/index.js" \
    "${ROOT}/backend/worker/dist/worker-audio.js" \
    "${ROOT}/backend/worker/dist/worker-video.js" \
    "${ROOT}/backend/worker/dist/worker-merge.js" \
    "${ROOT}/frontend/.next/BUILD_ID"; do
    if [[ ! -f "$f" ]]; then
      missing=1
      break
    fi
  done
  if [[ "$missing" == "1" ]]; then
    warn "缺少生产构建，正在执行 npm run build:prod …"
    npm run build:prod
    return
  fi
  if [[ "${1:-}" == "--build" ]]; then
    info "执行 npm run build:prod …"
    npm run build:prod
  fi
}

validate_worker_counts() {
  if ! [[ "$MP3_WORKER_COUNT" =~ ^[1-9][0-9]*$ ]]; then
    echo "MP3_WORKER_COUNT 必须是正整数，当前: ${MP3_WORKER_COUNT}" >&2
    exit 1
  fi
  if ! [[ "$VIDEO_WORKER_COUNT" =~ ^[1-9][0-9]*$ ]]; then
    echo "VIDEO_WORKER_COUNT 必须是正整数，当前: ${VIDEO_WORKER_COUNT}" >&2
    exit 1
  fi
}

cmd_start() {
  local build_flag=""
  if [[ "${2:-}" == "--build" ]]; then
    build_flag="--build"
  fi

  need_docker
  load_env
  validate_worker_counts

  info "停止已有本机进程…"
  stop_local_processes

  if [[ ! -x "$CONCURRENTLY" ]]; then
    echo "缺少 node_modules，请在 ${ROOT} 执行 npm install" >&2
    exit 1
  fi

  info "启动 Docker：Postgres + Redis + LibreOffice 预览"
  "${COMPOSE[@]}" up -d postgres redis libreoffice
  wait_for_postgres
  ok "Docker 基础设施就绪"

  info "数据库迁移"
  npm run db:migrate:run

  ensure_build "$build_flag"

  local names="api,merge"
  local colors="blue,magenta"
  local -a cmds=(
    "cd '${ROOT}' && node backend/api/dist/index.js"
    "cd '${ROOT}' && node backend/worker/dist/worker-merge.js"
  )
  local i
  for ((i = 1; i <= MP3_WORKER_COUNT; i++)); do
    names+=",mp3${i}"
    colors+=",green"
    cmds+=("cd '${ROOT}' && node backend/worker/dist/worker-audio.js")
  done
  for ((i = 1; i <= VIDEO_WORKER_COUNT; i++)); do
    names+=",video${i}"
    colors+=",yellow"
    cmds+=("cd '${ROOT}' && node backend/worker/dist/worker-video.js")
  done
  names+=",web"
  colors+=",magenta"
  cmds+=("cd '${ROOT}/frontend' && PORT=${WEB_PORT} npm run start")

  echo ""
  info "启动生产栈（API :${API_PORT} · Web :${WEB_PORT} · LibreOffice :3010）"
  echo "   Worker: 1 合并 + ${MP3_WORKER_COUNT} 音频 + ${VIDEO_WORKER_COUNT} 视频"
  echo "   MP3 总并发 ≈ ${MP3_WORKER_COUNT} × YOUTUBE_AUDIO_WORKER_CONCURRENCY（见 .env）"
  echo "   视频总并发 ≈ ${VIDEO_WORKER_COUNT} × YOUTUBE_VIDEO_WORKER_CONCURRENCY（见 .env）"
  echo "   Ctrl+C 停止全部本机进程"
  echo ""

  export PORT="$API_PORT"
  export FILE_SERVICE_WEB_PORT="$WEB_PORT"
  export BACKEND_URL="${FILE_SERVICE_BACKEND_URL:-http://127.0.0.1:${API_PORT}}"

  exec "$CONCURRENTLY" -k -n "$names" -c "$colors" "${cmds[@]}"
}

cmd_status() {
  need_docker
  echo ""
  info "Docker 容器"
  "${COMPOSE[@]}" ps
  echo ""
  info "端口"
  for port in "$API_PORT" "$WEB_PORT" 3010 5432 6379; do
    if lsof -ti ":${port}" >/dev/null 2>&1; then
      echo "  :${port}  占用中"
    else
      echo "  :${port}  空闲"
    fi
  done
  echo ""
  if curl -sf --connect-timeout 2 "http://127.0.0.1:${API_PORT}/health" >/dev/null 2>&1; then
    echo "API health: ${GREEN}✓${NC}"
  else
    echo "API health: ${YELLOW}未响应${NC}"
  fi
  if curl -sf --connect-timeout 2 -o /dev/null "http://127.0.0.1:${WEB_PORT}/" 2>/dev/null; then
    echo "Web :${WEB_PORT}: ${GREEN}✓${NC}"
  else
    echo "Web :${WEB_PORT}: ${YELLOW}未响应${NC}"
  fi
}

case "${1:-}" in
  stop) cmd_stop ;;
  start) cmd_start "$@" ;;
  status) cmd_status ;;
  -h|--help|help) usage ;;
  *)
    usage
    exit 1
    ;;
esac
