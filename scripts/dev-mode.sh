#!/usr/bin/env bash
# 开发模式切换（默认轻量，不占内存）：
#   ./scripts/dev-mode.sh          — 同 dev:docker，Postgres+Redis 在 Docker，本机跑 API/Worker/Web
#   ./scripts/dev-mode.sh docker   — 同上（推荐）
#   ./scripts/dev-mode.sh full     — 全 Docker 含 LibreOffice（内存占用大，易卡死）
#   ./scripts/dev-mode.sh stop     — 停止 Docker api/worker
#   ./scripts/dev-mode.sh status   — 查看状态

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

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
用法: ./scripts/dev-mode.sh [docker|full|stop|status]

  docker   【推荐·轻量】Docker 只跑 Postgres + Redis，本机 npm run dev
           · 内存占用小，适合日常开发
           · 直接上传 .pptx 即可预览；.ppt 需本机 LibreOffice 或转为 .pptx

  full     【高内存】API + Worker 也在 Docker（含 LibreOffice，约 1.5GB+）
           · 仅在本机无法安装 LibreOffice 且机器内存充足时使用
           · 容易卡死，不推荐 MacBook Air 等低内存设备

  stop     停止 Docker 中的 api、worker（full 模式）

  status   查看容器与端口

npm 快捷命令：
  npm run dev:docker       轻量模式（推荐）
  npm run dev:docker:full  全 Docker（高内存）
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

stop_full_stack() {
  need_docker
  docker compose --profile full stop api worker 2>/dev/null || true
  docker compose stop api worker 2>/dev/null || true
}

start_infra() {
  need_docker
  info "启动 Postgres + Redis（轻量）…"
  docker compose up -d postgres redis
}

cmd_stop() {
  stop_full_stack
  ok "已停止 Docker api/worker。Postgres / Redis 仍在运行。"
}

cmd_status() {
  need_docker
  echo ""
  info "Docker 容器"
  docker compose --profile full ps 2>/dev/null || docker compose ps
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
  if docker compose --profile full ps api 2>/dev/null | grep -q 'Up'; then
    echo "后端: ${YELLOW}Docker full 模式${NC}（含 LibreOffice，高内存）"
  else
    echo "后端: ${GREEN}本机模式${NC}（推荐）或仅基础设施"
  fi
}

cmd_docker() {
  need_docker
  echo ""
  info "轻量开发模式"
  echo "   · Docker: 仅 Postgres + Redis（约几十 MB）"
  echo "   · 本机: API + Worker + Web（npm run dev）"
  echo "   · 推荐直接上传 .pptx，无需 LibreOffice"
  echo ""

  if [[ ! -f .env ]]; then
    echo "缺少 .env，请先复制 .env.example 并配置。" >&2
    exit 1
  fi

  stop_full_stack
  free_port 3000
  start_infra

  echo ""
  ok "基础设施就绪"
  if ! command -v soffice >/dev/null 2>&1; then
    warn "未检测到 LibreOffice — .ppt 预览/合并不可用，请上传 .pptx"
  fi
  echo ""
  info "启动 npm run dev …"
  npm run dev
}

cmd_full() {
  need_docker
  echo ""
  warn "全 Docker 模式（含 LibreOffice）"
  echo "   · API + Worker 各需大量内存，低配置机器可能卡死"
  echo "   · 若只是开发，请用: npm run dev:docker"
  echo ""
  read -r -p "仍要继续？[y/N] " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "已取消。"
    exit 0
  fi

  free_port 3000
  info "构建并启动 full 栈（postgres redis api worker）…"
  docker compose --profile full up --build -d postgres redis api worker

  echo ""
  ok "Docker 后端 → http://localhost:3000"
  warn "存储在 Docker 卷 file_storage，与 ./data/storage 不共用"
  warn ".ppt 预览仅在 full 模式的 worker 中转换；API 容器不含 LibreOffice"
  echo ""
  info "启动前端 …"
  npm run dev:web
}

case "${1:-docker}" in
  docker|local|"") cmd_docker ;;
  full) cmd_full ;;
  stop) cmd_stop ;;
  status) cmd_status ;;
  -h|--help|help) usage ;;
  *)
    usage
    exit 1
    ;;
esac
