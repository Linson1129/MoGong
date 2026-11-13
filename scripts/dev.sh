#!/usr/bin/env bash
# Start both servers side by side for local development.
#
# The backend runs on 8100 and the frontend on 3000. The frontend's Next.js rewrite forwards
# /api/* to the backend, so the browser talks to one origin only.
#
# Ctrl-C kills both. Output is interleaved, which is the point: the developer sees what each side
# is doing without switching terminals.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cleanup() {
    echo ""
    echo "Stopping servers..."
    [[ -n "${BACKEND_PID:-}" ]] && kill "$BACKEND_PID" 2>/dev/null || true
    [[ -n "${FRONTEND_PID:-}" ]] && kill "$FRONTEND_PID" 2>/dev/null || true
    wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# The 下载 Skill 包 button points at a file Next serves out of public/, so it has to exist before the
# frontend does, in development as much as in `make sites`. Staging is deterministic and cheap.
"$ROOT/backend/.venv/bin/python" "$ROOT/scripts/stage_skill.py"

echo "Starting backend on :8100"
(
    cd "$ROOT/backend"
    source .venv/bin/activate
    exec uvicorn app.main:app --port 8100 --reload
) &
BACKEND_PID=$!

echo "Starting frontend on :3000"
(
    cd "$ROOT/frontend"
    exec npm run dev
) &
FRONTEND_PID=$!

echo "Both servers are up. Ctrl-C to stop."
wait
