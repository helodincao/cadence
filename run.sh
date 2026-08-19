#!/usr/bin/env bash
#
# Run Cadence locally: FastAPI backend + Vite frontend, together.
# Ctrl+C stops both. The first run sets up the Python venv and node modules.
#
# Usage:
#   ./run.sh                 # backend on :8010, frontend on :5173 (or next free)
#   CADENCE_PORT=8020 ./run.sh   # use a different backend port
#
set -eo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
PORT="${CADENCE_PORT:-8010}"
VENV_PY="$BACKEND/.venv/bin/python"

info()  { printf '\033[36m→ %s\033[0m\n' "$1"; }
warn()  { printf '\033[33m⚠  %s\033[0m\n' "$1"; }
error() { printf '\033[31m✗ %s\033[0m\n' "$1" >&2; }

# --- prerequisites -----------------------------------------------------------
command -v python3 >/dev/null 2>&1 || { error "python3 not found on PATH."; exit 1; }
command -v npm     >/dev/null 2>&1 || { error "npm not found on PATH."; exit 1; }

# --- backend setup (venv + deps) --------------------------------------------
if [ ! -x "$VENV_PY" ]; then
  info "Creating backend virtualenv (backend/.venv)…"
  python3 -m venv "$BACKEND/.venv"
fi
if ! "$VENV_PY" -c "import fastapi, uvicorn" >/dev/null 2>&1; then
  info "Installing backend dependencies…"
  "$BACKEND/.venv/bin/pip" install -q --upgrade pip
  "$BACKEND/.venv/bin/pip" install -q -r "$BACKEND/requirements.txt"
fi

# --- AI key check (non-fatal) ------------------------------------------------
if [ ! -f "$BACKEND/.env" ] || ! grep -qE '^(GEMINI_API_KEY|ANTHROPIC_API_KEY)=.+' "$BACKEND/.env"; then
  warn "No AI key in backend/.env — file import will use the basic regex fallback."
  warn "Add GEMINI_API_KEY (free key: https://aistudio.google.com/apikey) to enable AI parsing."
fi

# --- frontend setup (node modules) ------------------------------------------
if [ ! -d "$FRONTEND/node_modules" ]; then
  info "Installing frontend dependencies (npm install)…"
  ( cd "$FRONTEND" && npm install )
fi

# --- port availability -------------------------------------------------------
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  error "Port $PORT is already in use (another server, e.g. your Hyperloop dashboard?)."
  error "Pick another: CADENCE_PORT=8020 ./run.sh"
  exit 1
fi

# Keep the frontend pointed at whatever backend port we actually use.
export VITE_API_BASE="http://127.0.0.1:$PORT"

# --- launch both, clean up on exit ------------------------------------------
pids=()
# Recursively kill a process and its descendants. uvicorn --reload and Vite each
# spawn child processes, so killing only the launcher would leave them running.
kill_tree() {
  local pid=$1 child
  for child in $(pgrep -P "$pid" 2>/dev/null); do kill_tree "$child"; done
  kill "$pid" 2>/dev/null || true
}
cleanup() {
  printf '\n'; info "Stopping Cadence…"
  for pid in "${pids[@]}"; do kill_tree "$pid"; done
  wait 2>/dev/null || true
}
trap 'exit 130' INT TERM
trap cleanup EXIT

info "Backend  → http://127.0.0.1:$PORT  (health: /api/health)"
( cd "$BACKEND" && exec .venv/bin/uvicorn main:app --reload --port "$PORT" --host 127.0.0.1 ) &
pids+=($!)

info "Frontend → Vite will print its URL below (usually http://localhost:5173)"
( cd "$FRONTEND" && exec npm run dev ) &
pids+=($!)

printf '\033[32m✓ Cadence is starting — press Ctrl+C to stop both.\033[0m\n'
wait
