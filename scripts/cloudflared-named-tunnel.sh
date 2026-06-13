#!/usr/bin/env bash
# Cloudflare 命名隧道（固定子域名，如 https://api.example.com）
#
# 一次性准备（二选一）：
#   A) 控制台创建隧道并复制 Token → .env 设 CLOUDFLARE_TUNNEL_TOKEN + CLOUDFLARE_TUNNEL_HOSTNAME
#   B) CLI 全自动：npm run tunnel:login → 在 .env 设 CLOUDFLARE_TUNNEL_HOSTNAME → npm run tunnel:setup
#
# 日常：
#   npm run tunnel:run      # 启动命名隧道（API 需已在 TUNNEL_TARGET 监听）
#   npm run tunnel:status
#   npm run tunnel:stop
#   npm run tunnel:sync-env # 把固定 URL 写入 file-service / worship-player 的 .env

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

load_env() {
  if [[ -f .env ]]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
  fi
}

TUNNEL_NAME="${CLOUDFLARE_TUNNEL_NAME:-file-service-api}"
TUNNEL_HOSTNAME="${CLOUDFLARE_TUNNEL_HOSTNAME:-}"
TUNNEL_TARGET="${TUNNEL_TARGET:-http://127.0.0.1:3000}"
TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"

DATA_DIR="${ROOT}/data/cloudflared"
CONFIG_FILE="${DATA_DIR}/config.yml"
CREDS_FILE="${DATA_DIR}/credentials.json"
PID_FILE="${DATA_DIR}/cloudflared.pid"
LOG_FILE="${DATA_DIR}/cloudflared.log"
URL_FILE="${ROOT}/data/cloudflared.url"

mkdir -p "$DATA_DIR"

need_cloudflared() {
  if command -v cloudflared >/dev/null; then
    return 0
  fi
  echo "未找到 cloudflared。请先运行: bash scripts/cloudflared-install.sh" >&2
  exit 1
}

need_hostname() {
  load_env
  TUNNEL_HOSTNAME="${CLOUDFLARE_TUNNEL_HOSTNAME:-}"
  if [[ -n "$TUNNEL_HOSTNAME" ]]; then
    return 0
  fi
  if [[ -t 0 ]]; then
    read -rp "请输入 API 固定子域名（如 api.example.com）: " TUNNEL_HOSTNAME
    export CLOUDFLARE_TUNNEL_HOSTNAME="$TUNNEL_HOSTNAME"
  fi
  if [[ -z "$TUNNEL_HOSTNAME" ]]; then
    echo "请在 .env 中设置 CLOUDFLARE_TUNNEL_HOSTNAME=api.你的域名.com" >&2
    exit 1
  fi
}

stable_url() {
  echo "https://${TUNNEL_HOSTNAME}"
}

write_url_file() {
  need_hostname
  stable_url > "$URL_FILE"
}

has_origin_cert() {
  [[ -f "${HOME}/.cloudflared/cert.pem" ]]
}

tunnel_uuid() {
  cloudflared tunnel list 2>/dev/null | awk -v name="$TUNNEL_NAME" '$0 ~ name { print $1; exit }'
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
  pkill -f "cloudflared tunnel.*${TUNNEL_NAME}" 2>/dev/null || true
  pkill -f "cloudflared tunnel run --token" 2>/dev/null || true
}

write_config() {
  local uuid="$1"
  cat > "$CONFIG_FILE" <<EOF
# 由 scripts/cloudflared-named-tunnel.sh 生成，勿手改
tunnel: ${uuid}
credentials-file: ${CREDS_FILE}

ingress:
  - hostname: ${TUNNEL_HOSTNAME}
    service: ${TUNNEL_TARGET}
  - service: http_status:404
EOF
}

print_hint() {
  local base
  base="$(stable_url)"
  cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
固定 API 地址：  ${base}

1) file-service .env（或 npm run tunnel:sync-env）：
   PUBLIC_BASE_URL=${base}
   GOOGLE_OAUTH_REDIRECT_URI=${base}/v1/youtube/oauth/callback

2) worship-player .env：
   API_URL=${base}

3) Google OAuth 重定向 URI：
   ${base}/v1/youtube/oauth/callback

4) 确保 API 监听 ${TUNNEL_TARGET}
   日志：${LOG_FILE}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
}

cmd_login() {
  need_cloudflared
  echo "即将打开 Cloudflare 授权（选择要用的域名 zone）…"
  cloudflared tunnel login
  echo "登录完成。cert: ~/.cloudflared/cert.pem"
}

cmd_setup() {
  need_cloudflared
  load_env
  need_hostname

  if [[ -n "$TUNNEL_TOKEN" ]]; then
    write_url_file
    echo "已配置 Token 模式，固定地址：$(stable_url)"
    echo "运行 npm run tunnel:run 启动隧道"
    print_hint
    return 0
  fi

  if ! has_origin_cert; then
    echo "尚未登录 Cloudflare，请先运行: npm run tunnel:login" >&2
    exit 1
  fi

  local uuid
  uuid="$(tunnel_uuid || true)"
  if [[ -z "$uuid" ]]; then
    echo "创建命名隧道: ${TUNNEL_NAME}"
    cloudflared tunnel create "$TUNNEL_NAME"
    uuid="$(tunnel_uuid)"
  else
    echo "使用已有隧道: ${TUNNEL_NAME} (${uuid})"
  fi

  local src_creds="${HOME}/.cloudflared/${uuid}.json"
  if [[ ! -f "$src_creds" ]]; then
    echo "找不到凭证 ${src_creds}" >&2
    exit 1
  fi
  cp "$src_creds" "$CREDS_FILE"

  write_config "$uuid"

  echo "绑定 DNS: ${TUNNEL_HOSTNAME} → ${TUNNEL_NAME}"
  cloudflared tunnel route dns "$TUNNEL_NAME" "$TUNNEL_HOSTNAME" || true

  write_url_file
  print_hint
  echo "下一步: npm run tunnel:run && npm run tunnel:sync-env"
}

cmd_run() {
  need_cloudflared
  load_env
  stop_tunnel
  : > "$LOG_FILE"

  if [[ -n "$TUNNEL_TOKEN" ]]; then
    need_hostname
    write_url_file
    echo "Token 模式启动 → $(stable_url) → ${TUNNEL_TARGET}"
    nohup cloudflared tunnel run --token "$TUNNEL_TOKEN" >> "$LOG_FILE" 2>&1 &
    echo $! > "$PID_FILE"
    print_hint
    return 0
  fi

  if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "尚未 setup，请先: npm run tunnel:setup" >&2
    exit 1
  fi

  echo "命名隧道启动 → ${TUNNEL_HOSTNAME} → ${TUNNEL_TARGET}"
  nohup cloudflared tunnel --config "$CONFIG_FILE" run >> "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 2
  write_url_file
  print_hint
}

cmd_status() {
  need_cloudflared
  load_env

  if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "cloudflared 运行中 (PID $(cat "$PID_FILE"))"
  else
    echo "cloudflared 未运行"
  fi

  if [[ -f "$URL_FILE" ]]; then
    local base
    base="$(cat "$URL_FILE")"
    print_hint
    if curl -sf --connect-timeout 8 "${base}/health" >/dev/null 2>&1; then
      echo "健康检查：${base}/health ✓"
    else
      echo "健康检查：${base}/health 未响应（确认 API 在 ${TUNNEL_TARGET:-http://127.0.0.1:3000} 运行且隧道已启动）"
    fi
  elif [[ -n "${CLOUDFLARE_TUNNEL_HOSTNAME:-}" ]]; then
    write_url_file
    cmd_status
  else
    echo "尚未配置，运行 npm run tunnel:setup"
  fi
}

cmd_stop() {
  stop_tunnel
  echo "已停止命名隧道"
}

case "${1:-}" in
  login) cmd_login ;;
  setup) cmd_setup ;;
  run) cmd_run ;;
  status) cmd_status ;;
  stop) cmd_stop ;;
  *)
    echo "用法: $0 {login|setup|run|status|stop}" >&2
    exit 1
    ;;
esac
