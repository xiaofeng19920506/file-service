#!/usr/bin/env bash
# 并行运行多条命令；子进程退出后自动重启（避免 Worker 挂掉拖垮 API）。
# LaunchAgent 在 Desktop 等受保护目录下无法读取 concurrently.js（EPERM），故自启脚本用此替代。
set -uo pipefail

if [[ $# -lt 1 ]]; then
  echo "用法: supervise-commands.sh <cmd1> [cmd2 ...]" >&2
  exit 1
fi

declare -a CMDS=("$@")
declare -a PIDS=()

cleanup() {
  local pid
  for pid in "${PIDS[@]}"; do
    [[ -n "${pid:-}" ]] || continue
    kill "$pid" 2>/dev/null || true
  done
}

trap cleanup EXIT INT TERM

start_one() {
  local idx="$1"
  /bin/bash -c "${CMDS[$idx]}" &
  PIDS[$idx]=$!
}

for i in "${!CMDS[@]}"; do
  start_one "$i"
done

while true; do
  for i in "${!CMDS[@]}"; do
    pid="${PIDS[$i]:-}"
    if [[ -z "$pid" ]] || ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" 2>/dev/null || true
      echo "$(date -Iseconds) supervise: restart cmd#$((i + 1))" >&2
      start_one "$i"
    fi
  done
  sleep 1
done
