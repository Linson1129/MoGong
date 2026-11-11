# MoGong Architecture

Version: v0.1
Role: technical decisions and their reasoning. Read `docs/spec.md` for product intent.

---

## 1. Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend framework | Next.js 16 (App Router, React 19, TypeScript, Tailwind 4) | Chosen by Captain. Used in its minimum form: one client-heavy route, no SSR on the canvas. |
| Canvas rendering | SVG, hand-rolled | See section 2. |
| State | Zustand | See section 3. |
| Styling | Tailwind CSS v4 | Required anyway by shadcn/ui; also produces class strings an agent can reuse. |
| UI components | shadcn/ui | Copy-in components, quiet defaults, matches the P1 "minimal UI" requirement. |
| Backend | Python 3.13, FastAPI, Pydantic v2 | Chosen by Captain. Stays thin, see section 5. |
| Persistence | JSON files on disk | See section 4. |
| Frontend tests | Vitest + React Testing Library | Interaction logic needs a DOM. |
| Backend tests | pytest | Chosen by Captain. The compiler is where they earn their cost. |

## 2. Why SVG and Not HTML Canvas

The requirement is rectangles with fill, border, and nesting, plus per-rectangle click,
double-click, right-click, drag, and resize.

SVG gives all of it for free. Every rectangle is a DOM node, so hit testing, `dblclick`,
`contextmenu`, and pointer capture are native behaviors the browser already implements correctly.
Zoom and pan are one attribute - the `transform` on a single wrapper group - rather than a matrix
applied by hand to every coordinate and every hit test. Nesting maps to SVG grouping, so a
parent-child relation is representable in the DOM and not only in a data structure beside it.

A `viewBox` rewrite was the first plan and was dropped for the frame the drawing actually needs.
A viewBox rescales the coordinate system, so every stroke width and handle size would shrink with
the zoom; the fixed-size chrome then has to be divided back out at every write. A
`translate(pan) scale(zoom)` group keeps the SVG user units equal to canvas pixels, which means the
screen size of a border or handle is a constant divided by the zoom, stated once in the renderer.
The conversion between the two spaces is the inverse of that transform and lives in
`src/lib/canvas-coords.ts`.

Canvas would require writing a scene graph, a spatial hit index, gesture arbitration, and a
transform stack. All of it is solvable, none of it is the product. At the MVP scale - tens of
elements, not thousands - canvas buys no performance that SVG actually needs.

`react-konva` and `fabric.js` were considered and rejected. Both would put a rendering abstraction
between the drawing code and the event model, which is exactly where this project's hardest bugs
live. Owning roughly 300 lines of SVG means a gesture bug is readable in one file.

Rejected: absolute-positioned HTML divs. Natively event-friendly, but it lets layout drift away
from the model - the DOM starts being the source of truth and the compiler inherits whatever the
browser decided. SVG keeps geometry as data.

## 3. State Management

Zustand, three stores, no Redux.

Canvas state changes on every pointer move during a drag. Redux's action-dispatch overhead and
selector plumbing would be paid on every one of those frames for structure this app does not need.
Zustand's `subscribe` plus per-field selectors gives frame-level updates without re-rendering the
sidebar.

| Store | Holds | Update rate |
|-------|-------|-------------|
| `useDocumentStore` | Elements, canvas config, meta | On committed edits only |
| `useInteractionStore` | Selection, hover, active gesture, temp drag rect | Every pointer move |
| `useViewStore` | Zoom, pan | Every wheel and pan move |
| `useHistoryStore` | Undo and redo stacks of document snapshots | With document commits |

The split between document and interaction is load-bearing. During a drag the element's live
geometry lives in `useInteractionStore`, and `useDocumentStore` is touched once, on pointer up.
Without that split, every frame mutates history and a single drag buries the undo stack in
sixty entries.

Undo uses full document snapshots rather than inverse operations. A layout document is a few
kilobytes; snapshotting it is trivial and it removes an entire category of bug where a custom
inverse does not exactly undo a custom apply. The history stack is capped at 100 entries.

## 4. Why No Redis

Captain proposed Redis on the grounds that persistence is not a concern. That reasoning removes
the reason to run Redis.

The actual persistence requirement, from P1, is: save a layout, load it back. That is a file
write and a file read. Redis adds a service to start, a port to conflict with, a serialization
format to keep in sync with the on-disk format, and a failure mode where the app does not start
because something unrelated is on 6379. It buys nothing for a single-user local design tool.

MySQL is further out: the data is one opaque JSON blob per layout with no relational query, no
concurrent writers, and no reporting.

`data/layouts/` on disk is the store. A layout is one file. Deleting a layout is deleting a file.
Backing up the work is copying a folder. If a requirement needing query or concurrent access
appears, it will be a real requirement, and SQLite will serve it without a daemon - the repository
layer in `backend/app/services/storage.py` exists so that swap does not touch the routers.

## 5. Backend Is Thin

Roughly 90 percent of this product's difficulty is frontend gesture work. The backend is a file
service and a compiler. The temptation to move logic server-side for architectural tidiness is
resisted deliberately:

| Concern | Lives in | Why |
|---------|----------|-----|
| Gesture arbitration | Frontend | Pointer events only exist there. |
| Live geometry | Frontend | Per-frame, cannot round-trip. |
| Nesting resolution | Both, same rules | See below. |
| Compile to layout JSON | Backend, authoritative | Captain reviews the output as a file. |
| Save and load | Backend | It owns the disk. |

Nesting and compile rules are implemented in Python as the authority, with a TypeScript mirror for
live in-editor preview. Divergence between the two is a real risk, so both are tested against one
shared set of fixtures in `fixtures/cases/`. Each case holds an input document and the expected
compiled output. The same fixtures drive pytest and Vitest, so the Python result is the golden file
the TypeScript tests are checked against - which turns drift into a test failure instead of a
confusing preview that disagrees with the exported file.

## 6. Directory Layout

```
mo-gong/
  docs/                  spec.md, json-schema.md, architecture.md, dev-guide.md
  fixtures/              Shared compile test cases: input document plus expected layout
    cases/
  data/
    layouts/             Saved *.mogong.json files. Gitignored, sample files committed.
    compiled/            Generated *.layout.json output. Gitignored.
  frontend/
    src/
      app/               Route shell
      components/
        canvas/          SvgCanvas, Rectangle, ResizeHandles, GestureLayer
        panel/           Sidebar, PropertyPanel, ColorPicker, BorderPicker, NoteEditor
        ui/              shadcn/ui primitives
      stores/            Zustand stores
      lib/
        geometry.ts      Containment, overlap, normalized rects
        compile.ts       Client-side mirror of the compile rules
        gestures.ts      Long-press and drag arbitration state machine
      types/             Shared TypeScript types, mirroring the contract
    tests/
  backend/
    app/
      main.py
      routers/           layouts.py, compile.py
      services/          storage.py, compiler.py, nesting.py, infer.py, validate.py
      schemas/           document.py, layout.py (Pydantic models, contract source of truth)
      models/            Python dataclasses used inside the compiler
    tests/
      test_compiler.py   Against shared fixtures
      test_nesting.py    Containment and overlap edge cases
      test_api.py        Endpoint smoke coverage
  scripts/               dev.sh bootstrap, smoke_test.sh
  Makefile
  README.md
```

## 7. Module Boundaries

```
  Pointer events
        |
        v
  gestures.ts ----> interaction store ----> SvgCanvas render
   (state machine)        |
                          | pointer up
                          v
                   document store ----> history store
                          |
                          | serialize
                          v
                    FastAPI /api/compile
                          |
                          v
                   nesting.py -> infer.py -> validate.py
                          |
                          v
                    *.layout.json  ----> Cursor
```

`gestures.ts` is a state machine with explicit states: `idle`, `pending`, `drawing`, `moving`,
`resizing`, `panning`. A pointer-down enters `pending` and starts the long-press timer. Crossing
the timer boundary while moving commits to `drawing`. Stopping and releasing before it commits to
`click` on pointer up. Every other gesture is decided the same way - one file, one state diagram,
no two components interpreting the same physical gesture differently.

This file gets written before the rectangle renders. It is the hardest part of the product and the
part most likely to feel wrong in the hand, and it is the only place timing lives.

## 8. API Surface

Deliberately small.

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | Liveness |
| GET | `/api/layouts` | List saved layouts |
| POST | `/api/layouts` | Create; body is a document |
| GET | `/api/layouts/{id}` | Read a document |
| PUT | `/api/layouts/{id}` | Overwrite a document |
| DELETE | `/api/layouts/{id}` | Remove a layout |
| POST | `/api/compile` | Document in, layout JSON out |
| POST | `/api/compile/validate` | Document in, warnings and errors out, writes nothing |

No auth, no users, no multi-tenancy. It binds to `127.0.0.1` by default - a local tool exposed on
a network with no authentication is a self-inflicted incident.

## 9. Ports and Dev Runtime

| Service | Port |
|---------|------|
| Next.js dev | 3000 |
| FastAPI dev | 8100 |

8100 rather than 8000 to avoid the common collision with other local tooling. Next.js rewrites
`/api/*` to the backend, so the browser only ever talks to 3000 and no CORS configuration exists
to get wrong.

`make dev` starts both. No Docker for MVP: this runs on one machine, and a compose file would add
a build step to every change in exchange for nothing.

## 10. Technical Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Gesture arbitration feels wrong | High | Isolated in `gestures.ts`; threshold is a constant; tuned with Captain early, before other work stacks on top |
| Inference produces confident nonsense | Medium | `free` plus warning instead of a silent best guess; fixture suite pins expected output |
| TS and Python compilers drift | Medium | Shared fixtures with Python as golden, both suites run in `make test` |
| Zoom and pan degrade rendering | Low | SVG with `shape-rendering: crispEdges` on rectangles; viewport is one `transform` write on a wrapper group, and screen-constant sizes are divided by the zoom in the renderer |
| Large drawings get slow | Low at MVP scale | Deferred; selection and hover are already per-element, so virtualization has a clean seam if it is ever needed |

The first risk is the one to spend time on. A tool whose drawing gesture feels untrustworthy gets
abandoned regardless of how correct its JSON is, and its users - backend developers without
frontend vocabulary - will not report the reason. It will just read as "this tool doesn't work".
