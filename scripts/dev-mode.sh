#!/usr/bin/env bash
# 开发模式：
#   ./scripts/dev-mode.sh          — Postgres+Redis 在 Docker，本机跑 API/Worker/Web
#   ./scripts/dev-mode.sh libre      — 同上，但 Worker 在 Docker（含 LibreOffice）
#   ./scripts/dev-mode.sh stop       — 停止 Docker worker
#   ./scripts/dev-mode.sh status     — 查看状态

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose -f shared/docker-compose.yml)

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

info() { echo -e "${BLUE}==>${NC} $*"; }
warn() { echo -e "${YELLOW}!!>${NC} $*"; }
ok() { echo -e "${GREEN} ok${NC} $*"; }

usage() {
  cat <<'EOF'
用法: ./scripts/dev-mode.sh [docker|libre|stop|status]

  docker   【推荐·轻量】Docker 跑 Postgres + Redis + LibreOffice 预览，本机 npm run dev
           · 周报 PPT 预览走 Docker 内 LibreOffice（:3010）
           · 需在 .env 设置 SOFFICE_PREVIEW_URL=http://localhost:3010

  libre    Docker 跑 Postgres + Redis + LibreOffice 预览 + Worker（含 LibreOffice，约 1.5GB+）
           · 本机只跑 API + Web；.ppt 合并转换由 Docker Worker 处理

  stop     停止 Docker 中的 worker（libre 模式）

  status   查看容器与端口

npm 快捷命令：
  npm run dev:docker        轻量模式（推荐）
  npm run dev:docker:libre  Worker 用 Docker（含 LibreOffice）
EOF
}

need_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "未找到 docker，请先安装 Docker Desktop。" >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker 未运行，请先启动 Docker Desktop。" >&2
    exit 1
  fi
}

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti ":${port}" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    warn "释放端口 ${port}（PID: $(echo "$pids" | tr '\n' ' ')）"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

stop_libre_worker() {
  need_docker
  "${COMPOSE[@]}" --profile libre stop worker 2>/dev/null || true
}

start_infra() {
  need_docker
  info "启动 Postgres + Redis + LibreOffice 预览服务…"
  "${COMPOSE[@]}" up -d --build postgres redis libreoffice
}

cmd_stop() {
  stop_libre_worker
  ok "已停止 Docker worker。Postgres / Redis 仍在运行。"
}

cmd_status() {
  need_docker
  echo ""
  info "Docker 容器"
  "${COMPOSE[@]}" --profile libre ps 2>/dev/null || "${COMPOSE[@]}" ps
  echo ""
  info "端口占用"
  for port in 3000 3010 5173 5432 6379; do
    if lsof -ti ":${port}" >/dev/null 2>&1; then
      echo "  :${port}  占用中"
    else
      echo "  :${port}  空闲"
    fi
  done
  echo ""
  if "${COMPOSE[@]}" ps libreoffice 2>/dev/null | grep -q 'Up'; then
    echo "LibreOffice 预览: ${GREEN}Docker :3010${NC}"
  else
    echo "LibreOffice 预览: ${YELLOW}未运行${NC}（docker compose up -d libreoffice）"
  fi
  if "${COMPOSE[@]}" --profile libre ps worker 2>/dev/null | grep -q 'Up'; then
    echo "Worker: ${YELLOW}Docker libre 模式${NC}（含 LibreOffice）"
  else
    echo "Worker: ${GREEN}本机模式${NC}（推荐）或仅基础设施"
  fi
}

cmd_docker() {
  need_docker
  echo ""
  info "轻量开发模式"
  echo "   · Docker: Postgres + Redis + LibreOffice 预览（:3010）"
  echo "   · 本机: API + Worker + Web（npm run dev）"
  echo "   · 周报预览: 设置 SOFFICE_PREVIEW_URL=http://localhost:3010"
  echo ""

  if [[ ! -f .env ]]; then
    echo "缺少 .env，请先复制 .env.example 并配置。" >&2
    exit 1
  fi

  stop_libre_worker
  free_port 3000
  start_infra

  echo ""
  ok "基础设施就绪"
  if ! grep -q '^SOFFICE_PREVIEW_URL=' .env 2>/dev/null; then
    warn "建议在 .env 添加 SOFFICE_PREVIEW_URL=http://localhost:3010 以启用周报 PPT 预览"
  fi
  echo ""
  info "启动 npm run dev …"
  export SOFFICE_PREVIEW_URL="${SOFFICE_PREVIEW_URL:-http://localhost:3010}"
  npm run dev
}

cmd_libre() {
  need_docker
  echo ""
  warn "LibreOffice Docker 模式"
  echo "   · Docker: Postgres + Redis + Worker（含 LibreOffice）"
  echo "   · 本机: API + Web"
  echo "   · Worker 容器挂载 ./data/storage，与本机 API 共用"
  echo ""

  if [[ ! -f .env ]]; then
    echo "缺少 .env，请先复制 .env.example 并配置。" >&2
    exit 1
  fi

  free_port 3000
  mkdir -p ./data/storage
  info "构建并启动 Postgres + Redis + LibreOffice 预览 + Worker…"
  "${COMPOSE[@]}" --profile libre up --build -d postgres redis libreoffice worker

  echo ""
  ok "Docker 基础设施就绪"
  echo ""
  info "启动本机 API + Web …"
  export SOFFICE_PREVIEW_URL="${SOFFICE_PREVIEW_URL:-http://localhost:3010}"
  npm run dev:api-web
}

case "${1:-docker}" in
  docker|local|"") cmd_docker ;;
  libre|full) cmd_libre ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  -h|--help|help) usage ;;
  *)
    usage
    exit 1
    ;;
esac
