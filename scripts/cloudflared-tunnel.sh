#!/usr/bin/env bash
# Cloudflare Quick Tunnel：为本地 API 提供 HTTPS 公网地址（OAuth 回调用）
#
# 用法（在运行 API 的机器上执行，API 默认监听 3000）：
#   ./scripts/cloudflared-tunnel.sh start
#   ./scripts/cloudflared-tunnel.sh status
#   ./scripts/cloudflared-tunnel.sh stop
#
# 环境变量：
#   TUNNEL_TARGET  默认 http://127.0.0.1:3000
#                  若 API 在另一台机器：TUNNEL_TARGET=http://98.115.143.29:3000 npm run tunnel:start
#                  （隧道进程需持续运行；长期建议在 API 本机跑 cloudflared 并指向 127.0.0.1:3000）

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_URL="${TUNNEL_TARGET:-http://127.0.0.1:3000}"
DATA_DIR="${ROOT}/data"
LOG_FILE="${DATA_DIR}/cloudflared.log"
PID_FILE="${DATA_DIR}/cloudflared.pid"
URL_FILE="${DATA_DIR}/cloudflared.url"

mkdir -p "$DATA_DIR"

need_cloudflared() {
  if command -v cloudflared >/dev/null; then
    return 0
  fi
  echo "未找到 cloudflared。安装：" >&2
  echo "  macOS:  brew install cloudflared" >&2
  echo "  Linux:  https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/" >&2
  exit 1
}

read_tunnel_url() {
  if [[ ! -f "$LOG_FILE" ]]; then
    return 1
  fi
  grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -1
}

stop_tunnel() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid="$(cat "$PID_FILE")"
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
      sleep 1
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$PID_FILE"
  fi
  pkill -f 'cloudflared tunnel --no-autoupdate --url' 2>/dev/null || true
  rm -f "$URL_FILE"
}

print_env_hint() {
  local base="$1"
  cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
隧道 HTTPS 地址：  ${base}

1) Google OAuth → 已授权的重定向 URI：
   ${base}/v1/youtube/oauth/callback

2) 服务器 API .env：
   PUBLIC_BASE_URL=${base}
   GOOGLE_OAUTH_REDIRECT_URI=${base}/v1/youtube/oauth/callback

3) 确保 API 已启动并监听 ${API_URL}
   日志：${LOG_FILE}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}

cmd_start() {
  need_cloudflared
  stop_tunnel
  : > "$LOG_FILE"

  echo "启动 Cloudflare Quick Tunnel → ${API_URL}"
  nohup cloudflared tunnel --no-autoupdate --url "$API_URL" >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"

  local url=""
  for _ in $(seq 1 45); do
    url="$(read_tunnel_url || true)"
    if [[ -n "$url" ]]; then
      echo "$url" > "$URL_FILE"
      print_env_hint "$url"
      return 0
    fi
    sleep 1
  done

  echo "隧道仍在启动，请稍后运行: ./scripts/cloudflared-tunnel.sh status" >&2
  echo "查看日志: tail -f ${LOG_FILE}" >&2
  exit 1
}

cmd_status() {
  need_cloudflared
  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "cloudflared 运行中 (PID $(cat "$PID_FILE"))"
  else
    echo "cloudflared 未运行"
  fi

  local url=""
  if [[ -f "$URL_FILE" ]]; then
    url="$(cat "$URL_FILE")"
  fi
  if [[ -z "$url" ]]; then
    url="$(read_tunnel_url || true)"
  fi
  if [[ -n "$url" ]]; then
    print_env_hint "$url"
    if curl -sf --connect-timeout 5 "${url}/health" >/dev/null 2>&1; then
      echo "健康检查：${url}/health ✓"
    else
      echo "健康检查：${url}/health 未响应（请确认 API 在 ${API_URL} 运行）"
    fi
  else
    echo "尚未获取隧道 URL，运行 ./scripts/cloudflared-tunnel.sh start"
  fi
}

cmd_stop() {
  stop_tunnel
  echo "已停止 cloudflared"
}

case "${1:-start}" in
  start) cmd_start ;;
  status) cmd_status ;;
  stop) cmd_stop ;;
  *)
    echo "用法: $0 {start|status|stop}" >&2
    exit 1
    ;;
esac
