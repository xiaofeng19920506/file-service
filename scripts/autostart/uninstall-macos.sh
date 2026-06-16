#!/usr/bin/env bash
set -euo pipefail

GUI="gui/$(id -u)"
for label in com.fileservice.named-tunnel com.fileservice.api-stack com.fileservice.web; do
  PLIST="${HOME}/Library/LaunchAgents/${label}.plist"
  launchctl bootout "$GUI" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
done

pkill -f "cloudflared tunnel run --token" 2>/dev/null || true
pkill -f "backend/api/src/index.ts" 2>/dev/null || true
pkill -f "backend/worker/src/index.ts" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true

echo "已卸载隧道、API 与前端的 LaunchAgent。"
echo "Application Support 保留在 ~/Library/Application Support/com.fileservice/（可手动删除）"
