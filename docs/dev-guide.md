# MoGong Development Guide

Version: v0.1
Scope: how we work, what lands in a commit, how to run the project.

---

## 1. Language Rules

| Context | Language |
|---------|----------|
| Conversation with Captain | Chinese |
| Code comments | English |
| Documentation | English |
| File and directory names | English |
| Variable, function, class names | English |
| Commit messages | English |
| Branch names | English |
| UI text shown to end users | English for MVP, with strings isolated for later translation |

The reason for English in code and filenames is tooling reliability, not preference. Mixed-language
paths break on some filesystems and CI images, and non-English identifiers make search and
copy-paste between code and docs lossy.

No emoji in documentation, commit messages, or UI copy. Not a style preference - emoji render
inconsistently across terminals and editors and encode badly in some git configurations.

## 2. Git Workflow

Direct commits to `main`. No feature branches for a two-party project: branching would add a merge
step that produces no isolation benefit here.

### Commit Message Format

```
<type>(<scope>): <imperative summary, 72 characters or fewer>

<optional body: what changed and why, wrapped at 72 characters>
```

| Type | Use |
|------|-----|
| `feat` | New capability |
| `fix` | Correcting broken behavior |
| `refactor` | Structure change, behavior preserved |
| `test` | Tests only |
| `docs` | Documentation only |
| `chore` | Build, config, dependencies |
| `style` | Formatting, no logic change |

Scopes: `canvas`, `panel`, `compiler`, `nesting`, `api`, `storage`, `schema`, `docs`, `infra`.

Examples:

```
feat(canvas): add long-press rectangle drawing
fix(nesting): treat partial overlap as sibling instead of parent
test(compiler): pin fixture for two-row layout inference
```

One commit per feature. The unit of work is whatever Captain can verify in one sitting - not a
file, not a milestone. History should let us find the moment a rule changed.

Commit bodies say why, not what. The diff already shows what changed; a body restating it is
noise that has to be maintained.

### Checkpoint Pushes

After each milestone, push and hand over for functional testing:

| Checkpoint | Contents |
|------------|----------|
| M1 | Architecture, scaffolding, docs - empty but running shell |
| M2 | Canvas core: draw, select, move, resize, delete, undo |
| M3 | Property panel: color, border, note, right-click edit |
| M4 | Compile engine producing agent-ready JSON |
| M5 | Save and load, minimal UI polish |
| M6 | Smoke test pass, MVP release |

## 3. Testing Policy

### What We Test

The compiler is the only part with a correct answer independent of the person who wrote it.
Geometry in, geometry out, fully deterministic. Test coverage there is genuinely cheap and
genuinely catches real bugs, so it gets real coverage.

### What We Do Not Test Aggressively

Canvas gesture handling. Automated interaction tests here mostly assert the browser's event model,
and the thing that actually matters - whether a long-press feels right in the hand - cannot be
asserted by any test. Captain's hands are the test. A `useState` mock that keeps a synthetic
pointer event alive through a fake timer is expensive to write and expensive to keep honest.

### Test Layers

| Layer | Tool | Runs | Required |
|-------|------|------|----------|
| Compiler unit | pytest | Every commit touching `backend/app/services/` | Yes |
| Schema unit | Vitest | Every commit touching `frontend/src/lib/` | Yes |
| Smoke | `scripts/smoke_test.sh` | Before each checkpoint push | Yes, at least once |
| Interaction | Manual by Captain | Each checkpoint | Yes |
| Full E2E | Playwright | Not before MVP | No |

### Smoke Test Definition

The shortest path proving the system still runs end to end, not a thorough check:

1. Backend starts, `/api/health` returns 200.
2. Frontend builds with no TypeScript error.
3. A fixture document compiles to valid layout JSON.
4. The output passes schema validation.
5. Save and reload yields an identical document.

Full regression sweeps between checkpoints are explicitly not wanted - they cost time without
catching anything the smoke pass would miss.

## 4. Code Conventions

### TypeScript

- `strict: true`, `noUncheckedIndexedAccess: true`
- No `any`. `unknown` plus a narrow when the type is genuinely not known.
- `interface` for object shapes, `type` for unions and utility types.
- Named exports only; no default exports, so editors can find every import site.
- Files use `kebab-case.ts` or `kebab-case.tsx`.
- React components are named functions, not arrow-assigned constants.
- Types shared across layers live in `src/types/`.
- Zustand store files are `use-x-store.ts`, and the hook they export is `useXStore`.

### Python

- Python 3.13, all function signatures typed.
- Pydantic v2 models at every API boundary. Dataclasses inside the compiler, never in a signature.
- Ruff for lint and format, line length 100.
- `snake_case` files and functions, `PascalCase` classes.
- The compiler is pure functions on immutable data: no I/O in `compiler.py`, `nesting.py`, or
  `infer.py`. Every one of them is testable without a filesystem or a server, which is exactly why
  the compiler is the part we can afford to test well.
- No global mutable state, including in tests.

### Geometry Rules

These are repeated because getting them wrong is how coordinates end up subtly off:

- Rectangles are `{x, y, width, height}`. Not `{x1, y1, x2, y2}`.
- `(x, y)` is the top-left corner.
- `width` and `height` are always non-negative. A reverse drag is normalized on write, never
  stored inverted and never fixed at render time.
- Floating point comparisons use an epsilon of `1e-9`.
- Containment is inclusive of boundaries: a child touching the parent edge is inside it.
- Pixel values are integers when written to the document; percentages are 2-decimal rounded.

## 5. Comment Policy

Write a comment when the code cannot say why it does something. Never when it can say what it does.

```python
# Wrong - restates the code
# Advance the index by one
index += 1

# Right - explains a decision the code cannot express
# Inclusive boundary: a child touching the parent edge counts as contained,
# per docs/spec.md section 5. Strict inequality drops zero-margin layouts.
if child.x >= parent.x:
    ...
```

Spec references in comments are encouraged. `# see docs/json-schema.md 4.2` is a maintainable
pointer; a paragraph of prose pasted into a comment is a second copy that will go stale.

`TODO` and `FIXME` carry an owner and a reason: `# TODO(arch): revisit once nesting is visual`.
Bare TODOs accumulate and stop meaning anything.

## 6. Local Setup

```bash
# One command, both services
make dev

# Or individually
make dev-backend     # FastAPI on 8100
make dev-frontend    # Next.js on 3000
make test            # pytest plus Vitest
make smoke           # smoke test only
```

First run needs:

```bash
cd backend && python3.13 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"
cd frontend && npm install
```

## 7. Definition of Done

A feature is done when all of these hold:

1. It satisfies the spec section it implements, or the spec has been updated first.
2. No TypeScript errors, no Ruff errors.
3. Compiler changes have a matching fixture in `fixtures/cases/`, on both sides of the mirror.
4. Comments are English and explain why, not what.
5. No emoji anywhere in the diff.
6. A smoke test passes.
7. The commit is pushed and its message says what Captain can go and check.

## 8. Escalation

If an implementation detail turns out to contradict the spec, stop and raise it rather than
quietly working around it. The spec is a contract with Captain, and a local fix that silently
changes a rule is how a tool ends up behaving in a way nobody chose.

If a technical constraint makes a P0 item disproportionate - likely candidates are the gesture
threshold and layout inference - report the cost with a proposed simplification and let Captain
decide, instead of shipping a degraded version without saying so.
