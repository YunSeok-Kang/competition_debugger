#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/data/server.pid"

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if ps -p "$PID" >/dev/null 2>&1; then
    echo "running (pid=$PID)"
    exit 0
  fi
  echo "stale pid file (pid=$PID)"
  exit 1
fi

echo "stopped"
