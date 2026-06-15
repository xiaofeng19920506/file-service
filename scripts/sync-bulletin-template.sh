#!/usr/bin/env bash
# 将桌面原版 PPT 同步到仓库模板目录（周报一切版式、背景图均以此为准）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE="${BULLETIN_TEMPLATE_SOURCE:-/Users/aaronliu/Desktop/06_14_2026.pptx}"
DEST="$ROOT/shared/templates/bulletin/06_14_2026.pptx"

if [[ ! -f "$SOURCE" ]]; then
  echo "error: source not found: $SOURCE" >&2
  echo "Set BULLETIN_TEMPLATE_SOURCE to your 06_14_2026.pptx path." >&2
  exit 1
fi

cp "$SOURCE" "$DEST"
echo "synced: $SOURCE -> $DEST"
shasum "$SOURCE" "$DEST"
