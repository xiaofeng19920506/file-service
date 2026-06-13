#!/usr/bin/env bash
# LaunchAgent 启动命名隧道（Token 从 .env 读取，不写进 plist）
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]]; then
  echo "CLOUDFLARE_TUNNEL_TOKEN 未设置，请写入 ${ROOT}/.env" >&2
  exit 1
fi

CLOUDFLARED="$(command -v cloudflared)"
exec "$CLOUDFLARED" tunnel run --token "$CLOUDFLARE_TUNNEL_TOKEN"
