#!/usr/bin/env bash
# 启动 Cloudflare 命名隧道（固定 api.youtvs.com）
# 手动：bash scripts/autostart/tunnel.sh
# 开机：LaunchAgent → ~/Library/Application Support/com.fileservice/tunnel-launch.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ "$SCRIPT_DIR" == *"Application Support/com.fileservice"* ]]; then
  ENV_FILE="${TUNNEL_ENV_FILE:-${SCRIPT_DIR}/tunnel.env}"
  LOG_FILE="${TUNNEL_LOG_FILE:-${SCRIPT_DIR}/tunnel.log}"
else
  ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
  ENV_FILE="${TUNNEL_ENV_FILE:-${ROOT}/.env}"
  LOG_FILE="${ROOT}/data/cloudflared/tunnel.log"
  mkdir -p "$(dirname "$LOG_FILE")"
fi

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

if [[ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
  echo "$(date -Iseconds) 缺少 CLOUDFLARE_TUNNEL_TOKEN（${ENV_FILE}）" >> "$LOG_FILE"
  exit 1
fi

CLOUDFLARED="$(command -v cloudflared || true)"
if [[ -z "$CLOUDFLARED" ]]; then
  echo "$(date -Iseconds) 未找到 cloudflared" >> "$LOG_FILE"
  exit 1
fi

HOST="${CLOUDFLARE_TUNNEL_HOSTNAME:-api.youtvs.com}"
echo "$(date -Iseconds) 启动隧道 → https://${HOST} → ${TUNNEL_TARGET:-http://127.0.0.1:3000}" >> "$LOG_FILE"

exec "$CLOUDFLARED" tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN" >> "$LOG_FILE" 2>&1
