#!/usr/bin/env bash
# Run the smoke test: both test suites plus a production build.
#
# The smoke test is the per-milestone checkpoint, not a regression suite. It starts the backend,
# runs every test, builds the frontend, and reports the result. It does not drive a browser -- that
# is milestone 6, not milestone 1.
#
# Exit code is the OR of the three steps, so a CI run can treat any failure as a red light.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_PORT=8100
BACKEND_PID=""

cleanup() {
    if [[ -n "$BACKEND_PID" ]]; then
        echo "Stopping backend (pid $BACKEND_PID)..."
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

echo "=== Smoke test ==="
echo ""

echo "--- Starting backend on :$BACKEND_PORT ---"
(
    cd "$ROOT/backend"
    source .venv/bin/activate
    exec uvicorn app.main:app --port "$BACKEND_PORT"
) &
BACKEND_PID=$!

echo "--- Waiting for backend to be ready ---"
for i in $(seq 1 30); do
    if curl -fs "http://127.0.0.1:$BACKEND_PORT/api/health" >/dev/null 2>&1; then
        echo "Backend is up."
        break
    fi
    if [[ $i -eq 30 ]]; then
        echo "Backend did not come up in 30 seconds." >&2
        exit 1
    fi
    sleep 1
done

echo ""
echo "--- Backend tests ---"
(
    cd "$ROOT/backend"
    .venv/bin/python -m pytest -q
)

echo ""
echo "--- Frontend tests ---"
(
    cd "$ROOT/frontend"
    npx vitest run
)

echo ""
echo "--- Frontend production build ---"
(
    cd "$ROOT/frontend"
    npm run build
)

echo ""
echo "=== Smoke test passed ==="
