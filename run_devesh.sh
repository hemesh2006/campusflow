#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_DIR="$ROOT_DIR/backend"
PYTHON="$BACKEND_DIR/.venv/bin/python"

# Windows venv fallback
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$BACKEND_DIR/.venv/Scripts/python.exe"
fi

if [[ ! -x "$PYTHON" ]]; then
  echo "❌  Backend virtual environment not found." >&2
  echo "    Run: python -m venv backend/.venv && backend/.venv/Scripts/pip install -r backend/requirements.txt" >&2
  exit 1
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "❌  Frontend node_modules not found." >&2
  echo "    Run: cd frontend && npm install" >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌  npm not found. Install Node.js first." >&2
  exit 1
fi

echo "🚀  Starting CampusFlow dev servers..."
echo "    Backend  → http://127.0.0.1:8000"
echo "    Frontend → http://127.0.0.1:5173"
echo "    Press Ctrl+C to stop both."
echo ""

# Start backend
cd "$BACKEND_DIR"
"$PYTHON" -m uvicorn django_project.asgi:application --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

# Start frontend
cd "$FRONTEND_DIR"
npm run dev -- --host 127.0.0.1 &
FRONTEND_PID=$!

cleanup() {
  echo ""
  echo "🛑  Stopping servers..."
  kill "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
  wait "$FRONTEND_PID" "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait -n "$FRONTEND_PID" "$BACKEND_PID"
