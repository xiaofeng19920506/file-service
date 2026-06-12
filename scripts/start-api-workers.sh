#!/usr/bin/env bash
# 本机：API + N 个 MP3 缓存 Worker + 1 个 PPT 合并 Worker
#
# 用法:
#   ./scripts/start-api-workers.sh           # 默认 5 个 MP3 worker + 1 个 merge worker
#   ./scripts/start-api-workers.sh 3         # 3 个 MP3 worker + 1 个 merge worker
#   MP3_WORKER_COUNT=5 ./scripts/start-api-workers.sh
#
# 建议 .env:
#   YOUTUBE_AUDIO_WORKER_CONCURRENCY=1   # 每个 MP3 worker 进程内并发（建议 1）
#   WORKER_CONCURRENCY=1                 # PPT 合并 worker 并发
#   YT_DLP_PATH=/opt/homebrew/bin/yt-dlp
#
# MP3 总并发 ≈ MP3_WORKER_COUNT × YOUTUBE_AUDIO_WORKER_CONCURRENCY
#
# npm 快捷: npm run dev:api-audio-5w

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MP3_WORKER_COUNT="${MP3_WORKER_COUNT:-${1:-5}}"

if ! [[ "$MP3_WORKER_COUNT" =~ ^[1-9][0-9]*$ ]]; then
  echo "MP3_WORKER_COUNT 必须是正整数，当前: ${MP3_WORKER_COUNT}" >&2
  exit 1
fi

COMPOSE=(docker compose -f shared/docker-compose.yml)
MERGE_WORKER_CMD="tsx watch backend/worker/src/worker-merge.ts"
AUDIO_WORKER_CMD="tsx watch backend/worker/src/worker-audio.ts"

info() { echo "==> $*"; }
warn() { echo "!!> $*"; }

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti ":${port}" 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    warn "释放端口 ${port}"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
}

if [[ ! -f .env ]]; then
  echo "缺少 .env，请先复制 .env.example 并配置。" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "需要 Docker 运行 Postgres + Redis。请先启动 Docker Desktop。" >&2
  exit 1
fi

info "启动 Postgres + Redis …"
"${COMPOSE[@]}" up -d postgres redis

free_port 3000

pkill -f "tsx watch backend/api/src/index.ts" 2>/dev/null || true
pkill -f "tsx watch backend/worker/src/index.ts" 2>/dev/null || true
pkill -f "tsx watch backend/worker/src/worker-merge.ts" 2>/dev/null || true
pkill -f "tsx watch backend/worker/src/worker-audio.ts" 2>/dev/null || true
sleep 1

names="api,merge"
colors="blue,magenta"
cmds=("tsx watch backend/api/src/index.ts" "$MERGE_WORKER_CMD")

for ((i = 1; i <= MP3_WORKER_COUNT; i++)); do
  names+=",mp3${i}"
  colors+=",green"
  cmds+=("$AUDIO_WORKER_CMD")
done

info "启动 API + 1 个合并 Worker + ${MP3_WORKER_COUNT} 个 MP3 Worker（Ctrl+C 全部停止）"
echo "   MP3 总并发 ≈ ${MP3_WORKER_COUNT} × YOUTUBE_AUDIO_WORKER_CONCURRENCY（见 .env）"
echo "   PPT 合并并发 = WORKER_CONCURRENCY（见 .env）"
echo ""

exec npx concurrently -k -n "$names" -c "$colors" "${cmds[@]}"
