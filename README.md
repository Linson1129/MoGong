# MoGong

A visual intent compiler for web layouts.

Independent developers who build with AI coding agents are usually precise when describing backend
behaviour, but describe the frontend in terms of colour and vibe. The first generation rarely
matches what they had in mind, and the corrections that follow are written in the same imprecise
prose the agent already misunderstood. MoGong turns that conversation into geometry: the user draws
rectangles on a canvas, assigns them colour, border, nesting, and notes, and the tool compiles the
drawing into a JSON file the agent can read without guessing.

## Status

Milestone 1 is complete: the backend contract, storage, and validation layer are in place with
107 passing tests and a clean ruff run; the frontend scaffolding is in place with 85 passing Vitest
tests, a clean ESLint run, and a clean `next build`. The shared geometry truth table is generated
and both halves of the drift guard are proven to fail on a real divergence.

Next up is milestone 2: drawing, selecting, moving, resizing, deleting, and undo on the canvas.

## Quick start

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn app.main:run --port 8100
```

`http://localhost:8100/api/health` should return `{"status": "ok", "service": "mogong", ...}`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

`http://localhost:3000` is the editor. The Next.js rewrite at `/api/*` forwards to port 8100, so
the browser never talks to two origins.

### Both together

```bash
make dev
```

## Development workflow

- One branch, `main`. Every feature lands as a single commit with the message format
  `feat(scope): description`, then pushed.
- Do not run tests more often than the milestones call for. A smoke test runs at each milestone
  boundary; the per-feature commits are the regression record.
- When the geometry module changes on either side, regenerate the truth table
  (`python scripts/generate_geometry_fixture.py`) and commit the result in the same commit.
- Comments, file names, and commit messages are in English. Documentation has no emoji.

## Architecture

The product is two small services that share one JSON contract:

- `frontend/` -- Next.js 16 with a single client-heavy route. SVG rendering, Zustand state,
  gesture arbitration. Roughly 300 lines of SVG code.
- `backend/` -- FastAPI with Pydantic v2. The compiler and the validator live here; the storage
  layer is a file repository with a seam for SQLite later.
- `fixtures/cases/` -- the shared geometry truth table both test suites check against.
- `docs/` -- `spec.md`, `json-schema.md`, `architecture.md`, `dev-guide.md`.

Read `docs/architecture.md` for the decisions and `docs/dev-guide.md` for the rules that govern
the code.

## Testing

```bash
make test          # both halves
make test-backend  # pytest from backend/
make test-frontend # vitest run from frontend/
```

The drift guard is the test that matters most: it is the reason the two implementations cannot
quietly disagree about what a drawing means.

## Smoke test

```bash
make smoke
```

Starts both servers, hits the health endpoint, runs the backend test suite, runs the frontend
test suite, and reports the result.

## License

To be decided.
