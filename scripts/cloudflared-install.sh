#!/usr/bin/env bash
# 在 API 服务器上安装 cloudflared（Linux amd64/arm64 或 macOS Homebrew）
set -euo pipefail

if command -v cloudflared >/dev/null; then
  echo "cloudflared 已安装: $(cloudflared --version)"
  exit 0
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
  if command -v brew >/dev/null; then
    echo "通过 Homebrew 安装 cloudflared…"
    brew install cloudflared
    echo "已安装: $(cloudflared --version)"
    exit 0
  fi
  echo "macOS 请先安装 Homebrew，或手动安装 cloudflared" >&2
  exit 1
fi

VERSION="${CLOUDFLARED_VERSION:-2026.6.0}"
INSTALL_DIR="${CLOUDFLARED_INSTALL_DIR:-/usr/local/bin}"

arch="$(uname -m)"
case "$arch" in
  x86_64|amd64) ARCH=amd64 ;;
  aarch64|arm64) ARCH=arm64 ;;
  *)
    echo "不支持的架构: $arch" >&2
    exit 1
    ;;
esac

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

url="https://github.com/cloudflare/cloudflared/releases/download/${VERSION}/cloudflared-linux-${ARCH}"
echo "下载 cloudflared ${VERSION} (${ARCH})…"
curl -fsSL "$url" -o "${tmp}/cloudflared"
chmod +x "${tmp}/cloudflared"

if [[ -w "$INSTALL_DIR" ]]; then
  mv "${tmp}/cloudflared" "${INSTALL_DIR}/cloudflared"
else
  sudo mv "${tmp}/cloudflared" "${INSTALL_DIR}/cloudflared"
fi

echo "已安装: $(cloudflared --version)"
