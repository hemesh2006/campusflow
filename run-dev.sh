#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
PYTHON="$BACKEND_DIR/.venv/bin/python"

if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$BACKEND_DIR/.venv/Scripts/python.exe"
fi

if [[ ! -x "$PYTHON" ]]; then
  echo "Backend virtual environment not found. Install backend/requirements.txt first." >&2
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Frontend dependencies not found. Run 'npm install' in frontend first." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Install Node.js and npm first." >&2
  exit 1
fi

cd "$BACKEND_DIR"
"$PYTHON" -m uvicorn django_project.asgi:application --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

cd "$FRONTEND_DIR"
npm run dev -- --host 127.0.0.1 &
FRONTEND_PID=$!

cleanup() {
  kill "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
  wait "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

printf 'Frontend: http://127.0.0.1:5173/\nBackend:  http://127.0.0.1:8000/health\nPress Ctrl+C to stop both.\n'
wait -n "$FRONTEND_PID" "$BACKEND_PID"