#!/usr/bin/env bash
# 安装 / 卸载 / 查看 macOS 开机自启（隧道 + API 栈）
#
# 用法：
#   ./scripts/autostart/install-macos.sh install-all   # API + 前端 + 隧道（推荐）
#   ./scripts/autostart/install-macos.sh install-tunnel
#   ./scripts/autostart/install-macos.sh install-api
#   ./scripts/autostart/install-macos.sh install-web
#   ./scripts/autostart/install-macos.sh status
#   ./scripts/autostart/uninstall-macos.sh             # 全部卸载

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SUPPORT_DIR="${HOME}/Library/Application Support/com.fileservice"
REPO_CONF="${SUPPORT_DIR}/repo.conf"

TUNNEL_PLIST_LABEL="com.fileservice.named-tunnel"
API_PLIST_LABEL="com.fileservice.api-stack"
WEB_PLIST_LABEL="com.fileservice.web"
TUNNEL_PLIST="${HOME}/Library/LaunchAgents/${TUNNEL_PLIST_LABEL}.plist"
API_PLIST="${HOME}/Library/LaunchAgents/${API_PLIST_LABEL}.plist"
WEB_PLIST="${HOME}/Library/LaunchAgents/${WEB_PLIST_LABEL}.plist"

TUNNEL_LOG="${SUPPORT_DIR}/tunnel.log"
API_LOG="${SUPPORT_DIR}/api-stack.log"
WEB_LOG="${SUPPORT_DIR}/web-stack.log"

load_repo_env() {
  if [[ -f "${ROOT}/.env" ]]; then
    set -a
    # shellcheck disable=SC1091
    source "${ROOT}/.env"
    set +a
  fi
}

info() { echo "==> $*"; }
gui_domain() { echo "gui/$(id -u)"; }

write_repo_conf() {
  mkdir -p "$SUPPORT_DIR"
  cat > "$REPO_CONF" <<EOF
FILE_SERVICE_REPO=${ROOT}
EOF
}

install_tunnel() {
  load_repo_env
  if [[ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
    echo "请先在 ${ROOT}/.env 设置 CLOUDFLARE_TUNNEL_TOKEN" >&2
    exit 1
  fi
  if ! command -v cloudflared >/dev/null; then
    echo "未找到 cloudflared，请先: bash scripts/cloudflared-install.sh" >&2
    exit 1
  fi

  write_repo_conf
  chmod +x "${ROOT}/scripts/autostart/tunnel.sh"
  cp "${ROOT}/scripts/autostart/tunnel.sh" "${SUPPORT_DIR}/tunnel.sh"
  chmod +x "${SUPPORT_DIR}/tunnel.sh"

  cat > "${SUPPORT_DIR}/tunnel.env" <<EOF
CLOUDFLARE_TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
CLOUDFLARE_TUNNEL_HOSTNAME=${CLOUDFLARE_TUNNEL_HOSTNAME:-api.youtvs.com}
TUNNEL_TARGET=${TUNNEL_TARGET:-http://127.0.0.1:3000}
EOF
  chmod 600 "${SUPPORT_DIR}/tunnel.env"

  cat > "${SUPPORT_DIR}/tunnel-launch.sh" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
SUPPORT_DIR="${HOME}/Library/Application Support/com.fileservice"
export TUNNEL_ENV_FILE="${SUPPORT_DIR}/tunnel.env"
exec "${SUPPORT_DIR}/tunnel.sh"
EOF
  chmod +x "${SUPPORT_DIR}/tunnel-launch.sh"

  cat > "$TUNNEL_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${TUNNEL_PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SUPPORT_DIR}/tunnel-launch.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${TUNNEL_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${TUNNEL_LOG}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>
</dict>
</plist>
EOF

  launchctl bootout "$(gui_domain)" "$TUNNEL_PLIST" 2>/dev/null || true
  launchctl bootstrap "$(gui_domain)" "$TUNNEL_PLIST"
  launchctl enable "$(gui_domain)/${TUNNEL_PLIST_LABEL}" 2>/dev/null || true
  launchctl kickstart -k "$(gui_domain)/${TUNNEL_PLIST_LABEL}" 2>/dev/null || true
  info "隧道 LaunchAgent 已安装"
}

install_api() {
  write_repo_conf
  if [[ -f "${ROOT}/.env" ]]; then
    cp "${ROOT}/.env" "${SUPPORT_DIR}/api.env"
    chmod 600 "${SUPPORT_DIR}/api.env"
  fi
  chmod +x "${ROOT}/scripts/autostart/api-stack.sh"
  cp "${ROOT}/scripts/autostart/api-stack.sh" "${SUPPORT_DIR}/api-stack.sh"
  chmod +x "${SUPPORT_DIR}/api-stack.sh"

  cat > "${SUPPORT_DIR}/api-launch.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC1091
source "${REPO_CONF}"
export FILE_SERVICE_REPO
export FILE_SERVICE_ENV="${SUPPORT_DIR}/api.env"
export FILE_SERVICE_LOG="${API_LOG}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
exec "${SUPPORT_DIR}/api-stack.sh"
EOF
  chmod +x "${SUPPORT_DIR}/api-launch.sh"

  cat > "$API_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${API_PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SUPPORT_DIR}/api-launch.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${API_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${API_LOG}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>15</integer>
</dict>
</plist>
EOF

  launchctl bootout "$(gui_domain)" "$API_PLIST" 2>/dev/null || true
  launchctl bootstrap "$(gui_domain)" "$API_PLIST"
  launchctl enable "$(gui_domain)/${API_PLIST_LABEL}" 2>/dev/null || true
  launchctl kickstart -k "$(gui_domain)/${API_PLIST_LABEL}" 2>/dev/null || true
  info "API LaunchAgent 已安装"
}

install_web() {
  write_repo_conf
  if [[ -f "${ROOT}/.env" ]]; then
    cp "${ROOT}/.env" "${SUPPORT_DIR}/web.env"
    chmod 600 "${SUPPORT_DIR}/web.env"
  fi
  chmod +x "${ROOT}/scripts/autostart/web-stack.sh"
  cp "${ROOT}/scripts/autostart/web-stack.sh" "${SUPPORT_DIR}/web-stack.sh"
  chmod +x "${SUPPORT_DIR}/web-stack.sh"

  cat > "${SUPPORT_DIR}/web-launch.sh" <<EOF
#!/usr/bin/env bash
set -euo pipefail
# shellcheck disable=SC1091
source "${REPO_CONF}"
export FILE_SERVICE_REPO
export FILE_SERVICE_ENV="${SUPPORT_DIR}/web.env"
export FILE_SERVICE_LOG="${WEB_LOG}"
export FILE_SERVICE_WEB_PORT="${FILE_SERVICE_WEB_PORT:-4000}"
export FILE_SERVICE_BACKEND_URL="${FILE_SERVICE_BACKEND_URL:-http://127.0.0.1:3000}"
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
exec "${SUPPORT_DIR}/web-stack.sh"
EOF
  chmod +x "${SUPPORT_DIR}/web-launch.sh"

  cat > "$WEB_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${WEB_PLIST_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${SUPPORT_DIR}/web-launch.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StandardOutPath</key>
  <string>${WEB_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${WEB_LOG}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>15</integer>
</dict>
</plist>
EOF

  launchctl bootout "$(gui_domain)" "$WEB_PLIST" 2>/dev/null || true
  launchctl bootstrap "$(gui_domain)" "$WEB_PLIST"
  launchctl enable "$(gui_domain)/${WEB_PLIST_LABEL}" 2>/dev/null || true
  launchctl kickstart -k "$(gui_domain)/${WEB_PLIST_LABEL}" 2>/dev/null || true
  info "前端 LaunchAgent 已安装"
}

cmd_status() {
  load_repo_env
  local host="${CLOUDFLARE_TUNNEL_HOSTNAME:-api.youtvs.com}"

  echo "=== 隧道 (${TUNNEL_PLIST_LABEL}) ==="
  [[ -f "$TUNNEL_PLIST" ]] && echo "plist: 已安装" || echo "plist: 未安装"
  launchctl print "$(gui_domain)/${TUNNEL_PLIST_LABEL}" >/dev/null 2>&1 && echo "状态: 已加载" || echo "状态: 未加载"
  pgrep -f "cloudflared tunnel run --token" >/dev/null && echo "cloudflared: 运行中" || echo "cloudflared: 未运行"

  echo ""
  echo "=== API (${API_PLIST_LABEL}) ==="
  [[ -f "$API_PLIST" ]] && echo "plist: 已安装" || echo "plist: 未安装"
  launchctl print "$(gui_domain)/${API_PLIST_LABEL}" >/dev/null 2>&1 && echo "状态: 已加载" || echo "状态: 未加载"
  lsof -i :3000 >/dev/null 2>&1 && echo "API :3000: 监听中" || echo "API :3000: 未监听"
  docker ps --format '{{.Names}}' 2>/dev/null | grep -q file-service-db && echo "Postgres 容器: 运行中" || echo "Postgres 容器: 未运行"

  echo ""
  echo "=== 前端 (${WEB_PLIST_LABEL}) ==="
  [[ -f "$WEB_PLIST" ]] && echo "plist: 已安装" || echo "plist: 未安装"
  launchctl print "$(gui_domain)/${WEB_PLIST_LABEL}" >/dev/null 2>&1 && echo "状态: 已加载" || echo "状态: 未加载"
  lsof -i :4000 >/dev/null 2>&1 && echo "Web :4000: 监听中" || echo "Web :4000: 未监听"

  echo ""
  echo "=== 健康检查 ==="
  if curl -sf --connect-timeout 8 "https://${host}/health" >/dev/null; then
    echo "https://${host}/health: ✓"
  else
    echo "https://${host}/health: 未响应"
  fi
  curl -sf --connect-timeout 3 "http://127.0.0.1:3000/health" >/dev/null 2>&1 && echo "http://127.0.0.1:3000/health: ✓" || echo "http://127.0.0.1:3000/health: 未响应"
  curl -sf --connect-timeout 3 "http://127.0.0.1:4000/health" >/dev/null 2>&1 && echo "http://127.0.0.1:4000/health: ✓" || echo "http://127.0.0.1:4000/health: 未响应"
  local web_url="${WEB_APP_URL:-}"
  if [[ -n "$web_url" ]]; then
    if curl -sf --connect-timeout 8 "${web_url%/}/health" >/dev/null; then
      echo "${web_url%/}/health: ✓"
    else
      echo "${web_url%/}/health: 未响应（确认 Cloudflare 已绑定前端域名 → :4000）"
    fi
  fi
}

case "${1:-install-all}" in
  install-all)
    install_api
    sleep 2
    install_web
    sleep 2
    install_tunnel
    sleep 5
    cmd_status
    cat <<EOF

全部开机自启已安装（LaunchAgent → bash 脚本）：
  API：  ${SUPPORT_DIR}/api-launch.sh  → api-stack.sh
  前端：${SUPPORT_DIR}/web-launch.sh  → web-stack.sh（:4000）
  隧道：${SUPPORT_DIR}/tunnel-launch.sh → tunnel.sh
  日志：${API_LOG} / ${WEB_LOG} / ${TUNNEL_LOG}

请在 Cloudflare 隧道添加 Public Hostname：frontend.youtvs.com → http://127.0.0.1:4000
（Vercel 前端无需隧道；.env 中 CORS_ORIGIN 同时包含两个前端域名）
请确认 Docker Desktop 已勾选「登录时打开」。
若自启失败且日志含 Operation not permitted，请将仓库移出 Desktop 或给 /bin/bash 完全磁盘访问权限。
EOF
    ;;
  install-tunnel) install_tunnel; cmd_status ;;
  install-api) install_api; cmd_status ;;
  install-web) install_web; cmd_status ;;
  status) cmd_status ;;
  *)
    echo "用法: $0 {install-all|install-tunnel|install-api|install-web|status}" >&2
    exit 1
    ;;
esac
