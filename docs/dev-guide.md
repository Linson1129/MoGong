# MoGong Development Guide

Version: v0.2
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
| UI text shown to end users | Chinese. The user is a Chinese-speaking backend developer who has to name a header and a sidebar without learning frontend vocabulary; an English canvas asks them to translate while they draw. |

The UI row above used to read "English for MVP, with strings isolated for later translation". The
product was built Chinese-first instead, by decisions made in the editor rather than in this file,
and by M4 every visible string was Chinese. Restating the plan as if it were still open would leave
a rule that every component in the repository violates, so the rule now describes the product. If
Captain wants English UI, that is a spec change and a sweep, not a slip.

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
The numbering below is the original plan. What actually shipped, in the order it shipped, is the
milestone table in `README.md`, where M3 is the property panel, M4 added export/import and theming,
and M5 is the agent Skill rather than save-and-load. Save and load through `/api/layouts` is still
unwired on the client - see `docs/architecture.md` section 4 - so do not treat any row here as a
record of what exists.

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

Canvas gesture handling, meaning the event stream. Automated interaction tests there mostly assert
the browser's event model, and the thing that actually matters - whether a drag starts drawing when
the hand expects it, and whether the sheet stops drawing where the paper stops - cannot be asserted by
any test. Captain's hands are the test. A `useState` mock that keeps a synthetic pointer event alive
through a fake timer is expensive to write and expensive to keep honest.

The arbitration itself is a different case and does get tested:
`frontend/src/lib/gestures.ts` decides from plain numbers (travel in screen pixels, whether the press
landed on the sheet, what handle is under the cursor) and has no DOM to mock, so `gestures.test.ts`
covers it directly. The rule of thumb is that a gesture is testable to exactly the depth that it is
pure. Where a display feature reached the same numbers - the canvas readouts that used to live in
`frontend/src/lib/annotations.ts` - it was tested that way too, against the compiler's own conversion.
That layer is gone, and what is left of the
shared geometry (`lib/geometry.ts`) keeps its unit tests plus the cross-language truth table.

### Measuring What Only Feels Wrong

Captain's hands decide *whether* a gesture is off; they cannot say what cost the frame, and both times
this was reported the first answer was in the wrong place. Two measurements answer it without installing
anything, from the browser console:

- **Per-frame main-thread health.** Dispatch two `mousemove`s per `requestAnimationFrame` for sixty
  frames along a real drag and record the rAF gaps plus any `longtask` entries. Gaps that stay at 17ms
  mean the gesture code is not the bottleneck, and the search belongs in paint rather than in React.
  This is what ruled out the state updates, and it also means a zero-lag DOM reading proves nothing: if
  the preview attribute is always current but still arrives late on screen, the cost is rasterization.
- **Raster cost of the static picture at the size it is really displayed.** Serialize the `<svg>`, load
  it as an `Image`, then `drawImage` into a canvas sized by `devicePixelRatio` and read one pixel back to
  force the flush. Rendering the same file with and without one effect isolates what that effect costs
  per repaint. Run it at the real window size -- the sheet measured 4ms in a 692x506 automation window
  and 19ms at 1512x982 retina, and only the second one is a blown frame budget.

Both need a *visible* page. `requestAnimationFrame` does not run in a hidden tab, so a background
automation window returns a healthy-looking nothing, which is the most misleading result there is.

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

What `make smoke` runs today, in order (`scripts/smoke_test.sh`):

1. Backend starts on `$BACKEND_PORT`; `/api/health` must answer within 30 seconds.
2. `pytest` - which covers compiling a fixture document to layout JSON, schema validation of the
   output, and save/reload round-trips (`test_api.py`, `test_compiler_e2e.py`, `test_storage.py`).
3. `vitest run`.
4. `next build`, which is also the TypeScript check.

The compile-path assertions are therefore inside step 2 rather than being separate HTTP calls: the
smoke script proves the server boots and the whole suite passes, and the endpoint itself is exercised
in-process by the API tests.

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
- Types shared across layers live in `frontend/src/types/`.
- Zustand store files are `use-x-store.ts`, and the hook they export is `useXStore`.

### Styling

Colour and shape have one owner, which is the rule this project learned twice:

- Every colour is a semantic token declared in `frontend/src/app/globals.css`. Components name tokens
  and nothing else: `bg-surface`, `text-ink-muted`, `border-hairline`, `bg-glass-tint`. No `slate-*`,
  no `bg-white`, no hex, no `rgb()`.
- No `dark:` variants anywhere in components. The `.dark` token block is what changes, so a component
  carrying a `dark:` class is a component that knows about themes - which is how a theme stops being
  editable.
- Radius, blur and elevation are tokens too: `rounded-control` for one-line controls, `rounded-field`
  for the multi-line note box, `rounded-overlay` for panes, `backdrop-blur-glass`,
  `backdrop-saturate-(--glass-saturate)` and `shadow-overlay` for depth. Writing `rounded-[7px]` in a
  component reinvents the scale one component at a time.
- The one literal colour that is correct is the default `fill` and `border` of a new rectangle in
  `svg-canvas.tsx`. That value is document data - it reaches the compiled artifact - not UI, so it
  must not follow the theme.
- The audit is a grep, not a test: `grep -rn 'slate-\|bg-white' frontend/src/components` and
  `grep -rn 'dark:' frontend/src/components` should both print nothing. A test cannot catch this
  failure mode, because a wrong colour still renders.

### Python

- Python: the floor is 3.11 (`requires-python`), CI runs 3.11, dev boxes may run newer. All function
  signatures typed.
- Pydantic v2 models at every API boundary. Dataclasses inside the compiler, never in a signature.
- Ruff for lint and format, line length 100.
- `snake_case` files and functions, `PascalCase` classes.
- The compiler is pure functions on immutable data: no I/O in `compiler.py`, `nesting.py`, `validate.py`,
  or anything under `services/infer/`. Every one of them is testable without a filesystem or a server,
  which is exactly why the compiler is the part we can afford to test well.
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
make help            # every target, with its one-line purpose
make dev             # both services: FastAPI :8100, Next.js :3000

make test            # test-backend then test-frontend
make test-backend    # pytest
make test-frontend   # vitest run
make lint            # ruff (backend, plus scripts/) then typecheck and eslint (frontend)
make smoke           # scripts/smoke_test.sh
make fixture         # regenerate fixtures/cases/geometry-truth-table.json from the Python
```

There are no `dev-backend` / `dev-frontend` targets; run the two processes by hand if that is what is
wanted:

```bash
cd backend && source .venv/bin/activate && uvicorn app.main:app --port 8100 --reload
cd frontend && npm run dev
```

Aim uvicorn at `app.main:app`. `app.main:run` imports cleanly and then ignores the `--port` you
passed, because `run()` builds its own server from settings.

First run needs:

```bash
cd backend && python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"   # 3.11 or newer
cd frontend && npm install
```

## 7. Definition of Done

A feature is done when all of these hold:

1. It satisfies the spec section it implements, or the spec has been updated first.
2. No TypeScript errors, no Ruff errors.
3. Geometry changes are regenerated into `fixtures/cases/geometry-truth-table.json` (`make fixture`)
   so both suites assert the same table; compiler semantic changes get a backend test naming the
   rule they pin.
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
