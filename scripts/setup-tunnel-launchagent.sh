#!/usr/bin/env bash
# 兼容旧路径 → scripts/autostart/install-macos.sh
exec "$(cd "$(dirname "$0")" && pwd)/autostart/install-macos.sh" "$@"
