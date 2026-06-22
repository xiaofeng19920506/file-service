#!/usr/bin/env bash
# 并行运行多条命令；任一子进程退出则结束（等同 concurrently -k，但不依赖 node_modules）。
# LaunchAgent 在 Desktop 等受保护目录下无法读取 concurrently.js（EPERM），故自启脚本用此替代。
set -uo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法: supervise-commands.sh <cmd1> [cmd2 ...]" >&2
  exit 1
fi

declare -a PIDS=()

cleanup() {
  local pid
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}

trap cleanup EXIT INT TERM

for cmd in "$@"; do
  /bin/bash -c "$cmd" &
  PIDS+=($!)
done

while true; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" || true
      exit 1
    fi
  done
  sleep 1
done
