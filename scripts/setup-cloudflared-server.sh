#!/usr/bin/env bash
# 在 API 服务器上部署 Cloudflare Quick Tunnel（配合 systemd 开机自启）
#
# 用法（SSH 登录服务器后，在仓库根目录）：
#   ./scripts/setup-cloudflared-server.sh
#
# 可选环境变量：
#   REPO_DIR          仓库路径，默认脚本上级目录
#   TUNNEL_TARGET     默认 http://127.0.0.1:3000
#   SERVICE_USER      运行用户，默认当前用户
#   SKIP_SYSTEMD=1    只安装 cloudflared + 手动启动，不写 systemd

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="${REPO_DIR:-$ROOT}"
TUNNEL_TARGET="${TUNNEL_TARGET:-http://127.0.0.1:3000}"
SERVICE_USER="${SERVICE_USER:-$(whoami)}"
DATA_DIR="${REPO_DIR}/data"
LOG_FILE="${DATA_DIR}/cloudflared.log"
SERVICE_NAME="file-service-tunnel"

info() { echo "==> $*"; }

if [[ "$(id -u)" -eq 0 ]] && [[ -z "${ALLOW_ROOT:-}" ]]; then
  echo "请不要用 root 直接运行；用部署 API 的普通用户执行：" >&2
  echo "  ./scripts/setup-cloudflared-server.sh" >&2
  exit 1
fi

info "安装 cloudflared…"
bash "${ROOT}/scripts/cloudflared-install.sh"

mkdir -p "$DATA_DIR"

if [[ "${SKIP_SYSTEMD:-}" != "1" ]] && command -v systemctl >/dev/null; then
  UNIT_PATH="${HOME}/.config/systemd/user/${SERVICE_NAME}.service"
  mkdir -p "$(dirname "$UNIT_PATH")"

  cat > "$UNIT_PATH" <<EOF
[Unit]
Description=Cloudflare Quick Tunnel for file-service API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}
ExecStart=$(command -v cloudflared) tunnel --no-autoupdate --url ${TUNNEL_TARGET}
StandardOutput=append:${LOG_FILE}
StandardError=append:${LOG_FILE}
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
EOF

  info "注册 systemd 用户服务 ${SERVICE_NAME}…"
  systemctl --user daemon-reload
  systemctl --user enable "${SERVICE_NAME}"
  systemctl --user restart "${SERVICE_NAME}"

  if ! systemctl --user is-active --quiet "${SERVICE_NAME}"; then
    echo "隧道服务启动失败，查看日志：" >&2
    echo "  journalctl --user -u ${SERVICE_NAME} -n 50 --no-pager" >&2
    exit 1
  fi

  # 允许用户未登录时也运行（服务器常用）
  if command -v loginctl >/dev/null; then
    sudo loginctl enable-linger "$SERVICE_USER" 2>/dev/null || \
      info "提示：若重启后隧道不自动运行，执行 sudo loginctl enable-linger ${SERVICE_USER}"
  fi

  info "等待隧道 URL…"
  url=""
  for _ in $(seq 1 45); do
    if [[ -f "$LOG_FILE" ]]; then
      url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG_FILE" 2>/dev/null | head -1 || true)"
    fi
    [[ -n "$url" ]] && break
    sleep 1
  done

  if [[ -z "$url" ]]; then
    echo "暂未从日志解析到 URL，请稍后执行：" >&2
    echo "  grep trycloudflare ${LOG_FILE}" >&2
    exit 0
  fi

  echo "$url" > "${DATA_DIR}/cloudflared.url"
else
  info "跳过 systemd，改用手动启动…"
  TUNNEL_TARGET="$TUNNEL_TARGET" bash "${ROOT}/scripts/cloudflared-tunnel.sh" start
  url="$(cat "${DATA_DIR}/cloudflared.url" 2>/dev/null || true)"
fi

cat <<EOF

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
隧道已在服务器上运行

HTTPS 地址：  ${url:-（见 ${LOG_FILE}）}

请确认 API .env 与 Google OAuth 重定向 URI 一致：
  PUBLIC_BASE_URL=${url}
  GOOGLE_OAUTH_REDIRECT_URI=${url}/v1/youtube/oauth/callback

常用命令：
  systemctl --user status ${SERVICE_NAME}
  systemctl --user restart ${SERVICE_NAME}
  journalctl --user -u ${SERVICE_NAME} -f
  grep trycloudflare ${LOG_FILE}

注意：Quick Tunnel 重启后 URL 会变，需同步更新 .env 和 Google Console。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EOF
