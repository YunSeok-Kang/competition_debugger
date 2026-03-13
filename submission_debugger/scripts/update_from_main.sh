#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_DIR="$(cd "$ROOT_DIR/.." && pwd)"
BRANCH="${1:-main}"

ENV_FILE_DEFAULT="$ROOT_DIR/.env"
ENV_FILE="${ENV_FILE:-$ENV_FILE_DEFAULT}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

PYTHON_BIN="${PYTHON_BIN:-python3}"

cd "$REPO_DIR"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

cd "$ROOT_DIR"
"$PYTHON_BIN" -m pip install -r requirements.txt

./scripts/stop.sh || true
./scripts/start.sh
sleep 2
curl -fsS "http://127.0.0.1:${SD_PORT:-18080}/healthz" >/dev/null

echo "Deploy sync complete: branch=$BRANCH"
