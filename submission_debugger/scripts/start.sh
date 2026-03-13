#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-/opt/conda/envs/colmap_env/bin/python}"
PID_FILE="$ROOT_DIR/data/server.pid"
LOG_FILE="$ROOT_DIR/data/server.log"

mkdir -p "$ROOT_DIR/data"

if [[ ! -x "$PYTHON_BIN" ]]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
  elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python)"
  else
    echo "No usable Python interpreter found. Set PYTHON_BIN explicitly."
    exit 1
  fi
fi

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE")"
  if ps -p "$OLD_PID" >/dev/null 2>&1; then
    echo "Server already running (pid=$OLD_PID)"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

cd "$ROOT_DIR"
nohup "$PYTHON_BIN" app.py > "$LOG_FILE" 2>&1 &
NEW_PID=$!
echo "$NEW_PID" > "$PID_FILE"

sleep 1
if ps -p "$NEW_PID" >/dev/null 2>&1; then
  echo "Server started (pid=$NEW_PID)"
  echo "Log: $LOG_FILE"
else
  echo "Server failed to start. Check log: $LOG_FILE"
  exit 1
fi
