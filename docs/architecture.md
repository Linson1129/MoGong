# MoGong Architecture

Version: v0.2
Role: technical decisions and their reasoning. Read `docs/spec.md` for product intent.
Pictures of everything below are in `docs/diagrams.md`; that file was drawn from the source, and
where it disagreed with this one, this one was wrong and has been corrected. Keep the two in step by
editing the claim here and the node there in the same commit.

---

## 1. Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Frontend framework | Next.js 16 (App Router, React 19, TypeScript, Tailwind 4) | Chosen by Captain. Used in its minimum form: one client-heavy route, no SSR on the canvas. |
| Canvas rendering | SVG, hand-rolled | See section 2. |
| State | Zustand | See section 3. |
| Styling | Tailwind CSS v4 | Class strings are what the downstream agent reads. No runtime between a token and the file someone greps. |
| UI components | Hand-rolled, no library | shadcn/ui was planned and never added. The whole surface is a toolbar, a sidebar and three floating panels; owning them keeps every colour on a token instead of a theme file forked from a package. |
| Backend | Python (pyproject floor 3.11, CI on 3.11), FastAPI, Pydantic v2 | Chosen by Captain. Stays thin, see section 5. |
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
`frontend/src/lib/canvas-coords.ts`.

Canvas would require writing a scene graph, a spatial hit index, gesture arbitration, and a
transform stack. All of it is solvable, none of it is the product. At the MVP scale - tens of
elements, not thousands - canvas buys no performance that SVG actually needs.

That last sentence is about node count, and node count was never the problem. The performance rule SVG
does impose is about **paint**: everything inside one `<svg>` is re-rastered together, so an expensive
effect living in the canvas makes every pointer move pay for it. This was a real bug, and it looked
exactly like a laggy gesture. The sheet's elevation was an `feDropShadow` on the paper rect, and an SVG
filter rasterizes its whole region rather than the part that changed, so dragging a new rectangle
re-blurred the paper on every mouse move: 19ms against 14ms without the filter on a 1512x982 retina
canvas, and 4ms for the same sheet in a small window, which is why the stutter only ever appeared on a
real screen. The shadow is now a `box-shadow` on an HTML overlay sized to the paper's screen rect, so a
preview change never invalidates it. Keep that rule -- no filters, and nothing else expensive, inside
the canvas paint path.

`react-konva` and `fabric.js` were considered and rejected. Both would put a rendering abstraction
between the drawing code and the event model, which is exactly where this project's hardest bugs
live. Owning roughly 650 lines of canvas code means a gesture bug is readable in one file.

Rejected: absolute-positioned HTML divs. Natively event-friendly, but it lets layout drift away
from the model - the DOM starts being the source of truth and the compiler inherits whatever the
browser decided. SVG keeps geometry as data.

## 3. State Management

Zustand, five stores, no Redux.

Canvas state changes on every pointer move during a drag. Redux's action-dispatch overhead and
selector plumbing would be paid on every one of those frames for structure this app does not need.
Zustand's `subscribe` plus per-field selectors gives frame-level updates without re-rendering the
sidebar.

| Store | Holds | Update rate |
|-------|-------|-------------|
| `useDocumentStore` | Elements, canvas config, meta | On committed edits only |
| `useInteractionStore` | Selection, the inspected element, active gesture, temp drag rect | Every pointer move |
| `useViewStore` | Zoom, pan | Every wheel and pan move |
| `useHistoryStore` | Undo and redo stacks of document snapshots | With document commits |
| `useThemeStore` | Light or dark | On an explicit user choice, plus once on mount |

`useThemeStore` deliberately holds nothing visual: it toggles the `.dark` class and persists the
choice. The colours are tokens in `frontend/src/app/globals.css`. It used to write the
canvas colours as inline custom properties on `<html>` as well, and because an inline style
outranks every stylesheet rule, that made the store the real source of truth and left the CSS
block looking dead to anyone editing it. One value, one owner.

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

`data/layouts/` on disk is the store the backend implements: a layout is one file, deleting a
layout is deleting a file, backing up the work is copying a folder. If a requirement needing query
or concurrent access appears, it will be a real requirement, and SQLite will serve it without a
daemon - the repository layer in `backend/app/services/storage.py` exists so that swap does not
touch the routers.

What the shipped editor actually persists today is narrower, and the gap is worth stating instead of
glossing: the frontend autosaves to `localStorage` and never calls the `/api/layouts` CRUD. Those
endpoints are implemented, tested and unused. Closing the gap is an integration step, not a redesign,
which is why it has stayed open while the canvas needed work.

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

Nesting and compile rules exist in Python only. There is no TypeScript mirror of the compiler: the
editor never shows compiled output until it asks the backend for it. That is the cheapest possible
answer to a drift risk - a rule that lives in one language cannot disagree with itself - and it is
affordable because the compile is fast enough to run on demand.

What the two languages do share is geometry, and that is pinned: `fixtures/cases/geometry-truth-table.json`
holds one table of contain, overlap and relative-conversion cases generated from the Python and
asserted by both pytest and Vitest. Percent rounding is deliberately *not* shared: `PERCENT_PRECISION
= 2` exists only in `backend/app/schemas/layout.py`. A hand-written copy used to sit in
`frontend/src/lib/constants.ts` with no consumer at all, which is the shape a shared constant takes on
its way to becoming a lie - two numbers free to disagree, and no test that would notice.

The client does not recompute percentages for display. An earlier build drew dimension rules, a gap
readout and a selection pill on the canvas, which required a second implementation of the compiler's
arithmetic (`frontend/src/lib/annotations.ts`). It was deleted, not memoized: the product records
intent, and the numbers a consumer must honour live in the artifact rather than beside the rectangle.
`toRelativeBox` stays in `geometry.ts` only because the shared truth table asserts it against the
Python implementation.

## 6. Directory Layout

The names below are the ones on disk. The earlier version of this tree listed `ui/`, `compile.ts`,
`ResizeHandles` and `BorderPicker`, none of which were ever created - and `data/` is not gitignored,
so compiled output lands in commits until someone decides otherwise.

```
mo-gong/
  docs/                  spec.md, json-schema.md, architecture.md, dev-guide.md, diagrams.md
  fixtures/cases/        geometry-truth-table.json: generated from Python, asserted by both suites
  data/                  tracked by git, not ignored
    layouts/             saved *.mogong.json (written by the API, which the UI does not call yet)
    compiled/            generated *.layout.json
  frontend/
    src/
      app/               route shell, globals.css (every design token lives here)
      components/
        canvas/          svg-canvas.tsx, rectangle.tsx, note-editor.tsx, context-menu.tsx
        layout/          editor-shell.tsx, toolbar.tsx, status-bar.tsx, help-dialog.tsx
        panel/           sidebar.tsx, appearance-panel.tsx, color-picker.tsx
      hooks/             use-history, use-clipboard, use-delete-key, use-arrow-key-panning
      stores/            use-document-store, use-interaction-store, use-view-store,
                         use-history-store, use-theme-store
      lib/
        geometry.ts      containment, overlap, normalized rects, toRelativeBox
        gestures.ts      drag arbitration (distance only, no clock) and the sheet test, pure
        handles.ts       the eight resize handles and their two resize modes
        hit-test.ts      topmost element under a point
        canvas-coords.ts screen to canvas space
        constants.ts     GESTURE, ZOOM, STAMP_THRESHOLD, PALETTE
        api.ts, export.ts
      types/             document.ts, layout.ts - the contract, mirrored
    tests/               geometry truth-table consumer
  backend/
    app/
      main.py            app factory, CORS-free, exception handlers, /api/health
      routers/           layouts.py, compile.py (compile.py holds POST /api/compile and /validate)
      services/          storage.py, compiler.py, nesting.py, validate.py
        infer/           layout_mode.py, roles.py, spacing.py, relative.py
      schemas/           base.py, document.py, layout.py (Pydantic models, contract source of truth)
      models/            geometry.py - the Rect value object the compiler passes around
      core/              config.py, deps.py
    tests/               api, compiler_e2e, geometry, geometry_fixture, layout_mode, nesting, roles,
                         schema_contract, storage, validate
  scripts/               dev.sh, smoke_test.sh, generate_geometry_fixture.py,
                         setup_branch_protection.sh
  .qoder/skills/mogong-layout/   SKILL.md (stack-neutral rules) + reference.md (field contract) +
                         react.md / vue.md / vanilla.md (per-stack spelling of the same intent)
  Makefile
  README.md
```

## 7. Module Boundaries

```
  Pointer events
        |
        v
  gestures.ts ----> interaction store ----> SvgCanvas render
   (pure classifier)  |              (rectangles and the draw preview read
                      | pointer up     the live gesture; rendering writes nothing)
                      v
               document store ----> history store
                      |
                      | serialize
                      v
                FastAPI /api/compile
                      |
                      v
            nesting.py -> infer/*.py -> validate.py
                      |
                      v
               *.layout.json  ----> an agent, via the mogong-layout Skill
```

`gestures.ts` is a state machine with explicit states: `idle`, `pending`, `drawing`, `moving`,
`resizing`. A pointer-down enters `pending` and leaves it on travel alone: the canvas-unit distance is
converted to screen pixels (multiplied by the zoom) and compared against `GESTURE.moveThresholdPx`, and
the only other input is what the press landed on -- the sheet draws, the desk pans. Moving a region is
exclusively Alt+drag, which is what retired the clock: a plain drag over a region no longer has two
possible meanings, so there is nothing left to disambiguate by holding. The decision is a pure function
of (distance, overSheet, handle under cursor), which is why it has a unit test and needs no fake timers.

Panning is deliberately not a state in that union: it is viewport state and lives in `useViewStore.isPanning`,
reached by the middle button directly and by the left button through the pending path. Both routes seed
the same anchor, so a desk drag and a middle drag move the view identically.

What that buys is the thing that was actually complained about: the preview rect tracks the cursor from
the first qualifying move rather than from the first move after 180ms, and a drag takes the same physical
effort at 15% zoom as at 400%. The threshold used to be compared against raw canvas units, which at 22.5%
zoom is 0.675 screen pixels -- smaller than a tremor, so a press-and-drag produced no rectangle at all.
Nothing about a press is hidden any more, so the long-press ink that advertised the old window was deleted
along with the window.

Every gesture is decided in this one file, so no two components interpret the same physical drag
differently. It is the hardest part of the product and the part most likely to feel wrong in the hand, and
it is the only place thresholds live.

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

Every route above is live and tested, and one of them is what the editor uses: export calls
`/api/compile`, everything else waits on the save-and-load integration described in section 4.
Listing the surface as if it were all wired up is how a doc starts a fiction of its own.

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

`scripts/dev.sh` and `scripts/smoke_test.sh` aim uvicorn at `app.main:app`, the ASGI object. Pointing
it at `app.main:run` instead looks plausible and is not: `run()` starts its own server from settings,
so the `--port` on the command line is ignored, and a smoke run on an overridden port polls a port
nobody ever bound.

## 10. Technical Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Gesture arbitration feels wrong | High | Isolated in `gestures.ts`; the threshold is a constant measured in screen pixels, so it behaves the same at every zoom; a press has one meaning per surface, so nothing has to be advertised visually; tuned with Captain early, before other work stacks on top |
| Inference produces confident nonsense | Medium | `free` plus warning instead of a silent best guess; fixture suite pins expected output |
| Dragging feels laggy | Came back once, closed twice | First by a readout layer that rebuilt the parent chain and extra SVG text every frame (deleted rather than memoized, because a sketch tool has no business being a ruler); later by the paper's `feDropShadow`, which re-rasterized its whole filter region on every preview move. The invariant is paint, not node count: nothing expensive lives inside the SVG, and per-element render stays cheap because the double-click handler is delegated on the canvas instead of written inline under `elements.map`, which defeated `Rectangle`'s memo |
| Docs describe a compiler mirror that does not exist | Was real, now closed | architecture.md claimed `lib/compile.ts` and artifact-level fixtures; both claims removed rather than implemented |
| Components name colours the tokens do not own | Was real, now closed | Two hundred-odd hard-coded `slate-*` classes and a second palette sitting in `rectangle.tsx` module constants survived the first token pass, so editing `globals.css` changed nothing on screen; components now name semantic tokens only, carry no `dark:` variant, and the audit is the grep in dev-guide section 4 |
| Zoom and pan degrade rendering | Low | SVG with `shape-rendering: crispEdges` on rectangles; viewport is one `transform` write on a wrapper group, and screen-constant sizes are divided by the zoom in the renderer |
| Large drawings get slow | Low at MVP scale | Deferred; selection is already per-element, so virtualization has a clean seam if it is ever needed |

The first risk is the one to spend time on. A tool whose drawing gesture feels untrustworthy gets
abandoned regardless of how correct its JSON is, and its users - backend developers without
frontend vocabulary - will not report the reason. It will just read as "this tool doesn't work".
