#!/usr/bin/env bash
# 开发模式：
#   ./scripts/dev-mode.sh          — Postgres+Redis 在 Docker，本机跑 API/Worker/Web
#   ./scripts/dev-mode.sh stop       —（兼容旧用法；当前无 Docker worker）
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
用法: ./scripts/dev-mode.sh [docker|stop|status]

  docker   【推荐】Docker 跑 Postgres + Redis，本机 npm run dev
  stop     兼容旧命令（无 Docker worker 可停）
  status   查看容器与端口

npm 快捷命令：
  npm run dev:docker        Postgres + Redis + 本机 API/Worker/Web
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

start_infra() {
  need_docker
  info "启动 Postgres + Redis…"
  "${COMPOSE[@]}" up -d postgres redis
}

cmd_stop() {
  ok "无 Docker worker 需停止。Postgres / Redis 仍在运行。"
}

cmd_status() {
  need_docker
  echo ""
  info "Docker 容器"
  "${COMPOSE[@]}" ps
  echo ""
  info "端口占用"
  for port in 3000 5173 5432 6379; do
    if lsof -ti ":${port}" >/dev/null 2>&1; then
      echo "  :${port}  占用中"
    else
      echo "  :${port}  空闲"
    fi
  done
  echo ""
  echo "Worker: ${GREEN}本机模式${NC}（youtube-audio）"
}

cmd_docker() {
  need_docker
  echo ""
  info "开发模式"
  echo "   · Docker: Postgres + Redis"
  echo "   · 本机: API + Worker + Web（npm run dev）"
  echo ""

  if [[ ! -f .env ]]; then
    echo "缺少 .env，请先复制 .env.example 并配置。" >&2
    exit 1
  fi

  free_port 3000
  start_infra

  echo ""
  ok "基础设施就绪"
  echo ""
  info "启动 npm run dev …"
  npm run dev
}

case "${1:-docker}" in
  docker|local|"") cmd_docker ;;
  libre|full)
    warn "libre 模式已移除（不再需要 LibreOffice）；改用 docker 模式"
    cmd_docker
    ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  -h|--help|help) usage ;;
  *)
    usage
    exit 1
    ;;
esac
