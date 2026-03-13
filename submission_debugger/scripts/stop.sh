#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/data/server.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No pid file. Server may not be running."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if ps -p "$PID" >/dev/null 2>&1; then
  kill "$PID"
  sleep 1
  if ps -p "$PID" >/dev/null 2>&1; then
    kill -9 "$PID"
  fi
  echo "Server stopped (pid=$PID)"
else
  echo "Process not found (pid=$PID)."
fi

rm -f "$PID_FILE"
