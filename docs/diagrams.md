# MoGong Diagrams

Version: v0.2
Role: pictures of the code as it stands. Every node and edge was read off the source rather than
redrawn from `docs/architecture.md`; where the two disagreed, architecture.md was corrected.

Chinese appears below only where it is the literal UI string or real data (e.g. `商品品类`).

The **display layer** is everything drawn over the rectangles that is not itself part of an
artifact: the dashed draw preview, the selection chrome. It reads state and
writes none. It used to carry an **annotation layer** as well - dimension rules, gap readouts and a
selection pill computed by `frontend/src/lib/annotations.ts`. That layer is deleted and the file no
longer exists: the numbers an agent must honour live in the artifact, and recomputing them every
frame was what made dragging feel heavy.

| # | Diagram | Question it answers |
|---|---------|---------------------|
| 1 | System overview | what runs where, and who owns the truth |
| 2 | Compile pipeline | how pixels become agent-readable intent |
| 3 | Frontend layers and update rates | why one drag does not produce sixty undo entries |
| 4 | Contract layer (UML) | the two JSON formats and the types they share |
| 5 | Backend collaboration (UML) | which module may call which |
| 6 | Frontend stores (UML) | state ownership, store by store |
| 7 | Sequence: drawing a rectangle | the frame-by-frame path from pointer down to commit |
| 8 | Sequence: exporting layout.json | the only cross-process path in the product |
| 9 | State machine: gesture arbitration | where the motion threshold lives |
| 10 | Dev runtime and shared test contract | how it starts, and what keeps both sides honest |

Rule for keeping this file true: a box with no file behind it does not belong in it.

---

## 1. System overview

```mermaid
flowchart LR
  subgraph Browser["browser: one origin only"]
    UI["src/app/page.tsx<br/>EditorPage (use client)"]
    subgraph FE["frontend src/"]
      Canvas["SvgCanvas and gesture handling<br/>components/canvas"]
      Display["display layer (read-only)<br/>draw preview · selection chrome"]
      Stores["Zustand stores<br/>stores/"]
      Lib["pure logic<br/>lib/: gestures · handles · geometry · api · export"]
      LS[("localStorage<br/>autosave, restored on mount")]
    end
  end
  subgraph BE["FastAPI backend :8100"]
    R["routers/<br/>layouts · compile"]
    S["services/<br/>compiler · nesting · infer · validate · storage"]
    Sch["schemas/ (Pydantic)<br/>the contract, single source of truth"]
    Disk[("data/layouts/*.mogong.json<br/>data/compiled/*.layout.json")]
  end
  Agent["downstream consumer<br/>agent + the mogong-layout Skill"]

  UI --> Canvas --> Stores
  Canvas --> Display
  Canvas --> Lib
  Display --> Lib
  Stores <--> LS
  Lib -->|"/api/* rewrite"| R
  R --> S
  S --> Sch
  S --> Disk
  Disk -->|"the mold: *.layout.json"| Agent
```

The document store, not the backend, is what the editor renders from; the backend is what the
exported file is computed by. That is why `data/` survives a browser refresh but a crash before
export costs nothing more than the autosave interval.

## 2. Compile pipeline

```mermaid
flowchart TD
  D["MoGongDocument<br/>flat · absolute pixels · nesting implied by geometry alone"] --> P1
  subgraph Pure["compiler.compile_document - pure: no disk, no clock (timestamp comes from the caller)"]
    P1["1. nesting.build_tree<br/>containment to tree, emits PARTIAL_OVERLAP"]
    P2["2. infer_layout_modes_recursive<br/>none / row / column / stack / free"]
    P3["3. infer_roles_recursive<br/>navigation / main / button / text ..."]
    P4["4. infer_spacing_and_alignment<br/>measured gaps · shared edges (2px tolerance)"]
    P5["5. convert_to_relative<br/>absolute px to parent percentages, 2 decimals"]
    P6["6. _assemble_layout_document<br/>tree to LayoutDocument"]
    P7["7. assert_no_element_dropped<br/>completeness invariant: tree vs document"]
    P1 --> P2 --> P3 --> P4 --> P5 --> P6 --> P7
  end
  P7 --> W["warning merge<br/>nesting · layout · spacing · completeness"]
  W --> L["LayoutDocument<br/>tree · relative percent · inferred role · note verbatim"]
  L --> OUT["LayoutRepository.save_compiled<br/>data/compiled/{id}.layout.json"]
```

Stages 2 to 5 mutate the `TreeNode` in place; only stage 6 crosses into Pydantic. That ordering is
what keeps the pipeline testable without a filesystem, and it is why a compile has no I/O to mock.

## 3. Frontend layers and update rates

```mermaid
flowchart TD
  PE["pointer · wheel · key events"] --> SC["SvgCanvas<br/>the only interpreter of gestures"]
  SC -->|"setGesture every frame"| IS["useInteractionStore<br/>selectedId · inspectedId · gesture · cursor"]
  IS -->|"preview render"| SC
  SC -->|"one commit on pointer up"| DS["useDocumentStore<br/>elements · canvas · meta · revision"]
  DS -->|"revision watched"| HS["useHistoryStore<br/>past / future snapshots, cap 100"]
  HS -->|"restoreSnapshot"| DS
  DS -->|"autosave"| LS[("localStorage")]
  DS -->|"toDocument(viewport)"| EX["lib/export"]
  EX --> API["lib/api -> POST /api/compile"]
  SC -->|"the live rect, not the stale one"| AN["display layer<br/>draw preview · selection chrome"]
  WB["useViewStore<br/>zoom · panX · panY"] --> SC
  SB["Sidebar · AppearancePanel · ColorPicker"] --> DS
  SB --> IS
  TB["Toolbar: export · import · zoom · theme"] --> EX
  TB --> DS
  HK["hooks: useHistory · useClipboard · useDeleteKey · useArrowKeyPanning"] --> DS
  HK --> IS
  HK --> HS
  LIB["pure lib: gestures · handles · hit-test · canvas-coords · geometry"] --> SC
  TH["useThemeStore"] -->|"toggles .dark only - the colours are tokens"| CS["app/globals.css"]
```

Three rates, deliberately separated: per frame (interaction), per edit (document, history,
autosave), per wheel tick (view). A frame costs one gesture write and one re-render of what the
gesture already holds; nothing in the render path walks the parent chain or measures siblings.

## 4. Contract layer (UML)

Two formats, deliberately not one: the editor's flat absolute-pixel document, and the compiled
tree of parent-relative percentages. `Border` is shared, which is the only place the two touch.

```mermaid
classDiagram
  direction LR

  class CamelModel {
    <<abstract>>
    camelCase aliases
    extra = forbid
  }

  class MoGongDocument {
    +format : str
    +version : str
    +get_element(id)
  }
  class DocumentMeta {
    +id : str
    +name : str
    +created_at : datetime
    +updated_at : datetime
  }
  class CanvasConfig {
    +width : float
    +height : float
    +background : str
    +grid_size : float
    +snap_to_grid : bool
  }
  class Viewport {
    +zoom : float
    +pan_x : float
    +pan_y : float
  }
  class Element {
    +id : str
    +x y width height : float
    +note : str
    +locked : bool
    +visible : bool
    +stamp : bool
    +right : float
    +area : float
  }
  class Fill {
    +color : str
    +opacity : float
  }
  class Border {
    +width : float
    +style : BorderStyle
    +color : str
    +radius : float
    +is_visible() bool
  }

  class LayoutDocument {
    +format : str
    +version : str
    +element_ids() set
  }
  class LayoutMeta {
    +name : str
    +source : str
    +generated_at : str
  }
  class CanvasSummary {
    +width : float
    +height : float
    +background : str
    +platform : str
  }
  class LayoutNode {
    +id : str
    +name : str
    +note : str
    +iter_ids() list
  }
  class Box {
    +x y width height : float
    +unit : BoxUnit
    +rounded() Box
  }
  class SpacingInfo {
    +axis : LayoutMode
    +gap : float
    +unit : BoxUnit
    +consistent : bool
  }
  class AlignInfo {
    +horizontal : str
    +vertical : str
    +tolerance_px : float
  }
  class StyleInfo {
    +fill : str
    +fill_opacity : float
    +border : Border
  }
  class LayoutWarning {
    +code : LayoutWarningCode
    +elements : list~str~
    +message : str
  }
  class LayoutMode {
    <<enum>>
    NONE ROW COLUMN STACK FREE
  }
  class ElementRole {
    <<enum>>
    NAVIGATION CONTENTINFO MAIN REGION
    CONTAINER BUTTON TEXT IMAGE BLOCK
  }

  CamelModel <|-- MoGongDocument
  CamelModel <|-- DocumentMeta
  CamelModel <|-- CanvasConfig
  CamelModel <|-- Viewport
  CamelModel <|-- Element
  CamelModel <|-- Fill
  CamelModel <|-- Border
  CamelModel <|-- LayoutDocument
  CamelModel <|-- LayoutNode
  CamelModel <|-- Box
  CamelModel <|-- LayoutWarning

  MoGongDocument *-- DocumentMeta : meta
  MoGongDocument *-- CanvasConfig : canvas
  MoGongDocument *-- Viewport : viewport
  MoGongDocument *-- "0..*" Element : elements
  Element *-- Fill : fill
  Element *-- Border : border
  LayoutDocument *-- LayoutMeta : meta
  LayoutDocument *-- CanvasSummary : canvas
  LayoutDocument *-- LayoutNode : root
  LayoutDocument *-- "0..*" LayoutWarning : warnings
  LayoutNode *-- "0..*" LayoutNode : children
  LayoutNode *-- Box : box
  LayoutNode *-- StyleInfo : style
  LayoutNode o-- "0..1" SpacingInfo : spacing
  LayoutNode o-- "0..1" AlignInfo : align
  LayoutNode --> ElementRole : role
  LayoutNode --> LayoutMode : layout
  SpacingInfo --> LayoutMode : axis
  StyleInfo --> Border : reuses the editing format type
  Element ..> LayoutNode : reshaped at compile stages 5 and 6
```

`extra = forbid` on every model is what makes the schema a contract rather than a hint: a field the
frontend invents fails the request instead of being silently dropped on the way to the agent.

## 5. Backend collaboration (UML)

```mermaid
classDiagram
  direction LR

  class Settings {
    +host : str
    +port : int
    +data_dir : Path
    +compiled_dir : Path
    +ensure_directories()
  }
  class deps {
    <<module>>
    +get_repository() LayoutRepository
    +get_compiled_dir() Path
  }
  class layouts_router {
    <<module>>
    +GET list_layouts()
    +POST create_layout(document)
    +GET get_layout(layout_id)
    +PUT put_layout(layout_id, document)
    +DELETE delete_layout(layout_id)
  }
  class compile_router {
    <<module>>
    +POST compile_layout(document) CompileResponse
    +POST validate_document(document) ValidationResponse
  }
  class compiler {
    <<module>>
    +compile_document(document) LayoutDocument
    -_assemble_layout_document(tree, document)
    -_tree_node_to_layout_node(node, document)
    -_merge_warnings(...)
  }
  class nesting {
    <<module>>
    +build_tree(elements, canvas) tuple
    -_find_smallest_container(rect, candidates)
    -_detect_partial_overlaps(elements)
    -_sort_children_by_position(node)
  }
  class TreeNode {
    +element : Element
    +rect : Rect
    +parent : TreeNode
    +children : list~TreeNode~
    +depth : int
    +layout_mode : str
    +role : str
    +walk() list
    +leaf_count() int
  }
  class infer {
    <<module>>
    +infer_layout_modes_recursive(node)
    +infer_roles_recursive(node, canvas)
    +infer_spacing_and_alignment(node)
    +convert_to_relative(node)
  }
  class validate {
    <<module>>
    +check_document(document) list~Problem~
    +assert_no_element_dropped(document, layout)
    +overlaps_partially(document)
    +is_degenerate(width, height) bool
  }
  class Rect {
    <<value object>>
    +x y width height : float
    +contains(other) bool
    +overlaps(other) bool
    +partially_overlaps(other) bool
    +overlap_area(other) float
    +to_relative(parent) Rect
  }
  class LayoutRepository {
    +root : Path
    +path_for(layout_id) Path
    +list_ids() list
    +exists(layout_id) bool
    +load(layout_id) MoGongDocument
    +save(document) Path
    +delete(layout_id)
    +save_compiled(layout_id, payload, target) Path
  }
  class Problem {
    <<frozen dataclass>>
    +code : ProblemCode
    +level : ProblemLevel
    +elements : tuple
    +message : str
  }
  class Errors {
    <<enumeration>>
    LayoutNotFoundError -> 404
    InvalidLayoutIdError -> 400
    StorageError -> 409
    CompileError -> 500
  }

  Settings --> LayoutRepository : builds root
  deps --> Settings
  deps --> LayoutRepository
  layouts_router --> deps
  compile_router --> deps
  compile_router --> compiler
  compile_router --> validate
  compile_router --> LayoutRepository : save_compiled
  layouts_router --> LayoutRepository
  compiler --> nesting : stage 1
  compiler --> infer : stages 2 to 5
  compiler --> validate : stage 7
  nesting --> TreeNode
  nesting --> Rect
  infer --> TreeNode
  validate --> Rect
  validate --> Problem
  LayoutRepository ..> Errors : raises
  compile_router ..> Errors : app-level handler maps to status codes
```

Only the routers touch HTTP, and only `LayoutRepository` touches the disk. `compiler`, `nesting`,
`infer` and `validate` are pure, which is why the whole pipeline runs under pytest with no fixtures
on disk and no server.

## 6. Frontend stores (UML)

```mermaid
classDiagram
  direction LR

  class useDocumentStore {
    +meta : DocumentMeta
    +canvas : CanvasConfig
    +elements : list~LayoutElement~
    +revision : int
    +applyEdit(edit)
    +addElement(element)
    +updateElement(id, patch)
    +updateFill(id, patch)
    +updateBorder(id, patch)
    +setNote(id, note)
    +removeElement(id)
    +reorderElement(id, direction)
    +setCanvas(patch)
    +loadDocument(document)
    +resetDocument(meta)
    +toDocument(viewport) MoGongDocument
    +getSnapshot() HistorySnapshot
    +restoreSnapshot(snapshot)
  }
  class useInteractionStore {
    +selectedId : str
    +inspectedId : str
    +gesture : ActiveGesture
    +noteEditingId : str
    +cursor : Point
    +select(id)
    +inspect(id)
    +setGesture(gesture)
    +beginNoteEditing(id)
    +endNoteEditing()
    +setCursor(position)
  }
  class useViewStore {
    +zoom : float
    +panX : float
    +panY : float
    +isPanning : bool
    +zoomAt(localX, localY, deltaY)
    +setZoom(zoom)
    +panBy(dx, dy)
    +panByStep(dx, dy, coarse)
    +setPanning(active)
    +resetView()
    +fitToView(container, canvas)
  }
  class useHistoryStore {
    +past : list~HistorySnapshot~
    +future : list~HistorySnapshot~
    +lastProcessedRevision : int
    +processRevisionChange()
    +undo()
    +redo()
    +clear()
    +init()
  }
  class useThemeStore {
    +theme : light or dark
    +toggleTheme()
    +setTheme(theme)
  }
  class ActiveGesture {
    <<union>>
    idle
    pending origin, overSheet
    drawing origin, current Rect
    moving id, offset
    resizing id, handle, original, current
  }
  class lib_geometry {
    <<module>>
    +rectFromCorners(a, b, c, d) Rect
    +contains(a, b) bool
    +overlaps(a, b) bool
    +partiallyOverlaps(a, b) bool
    +GEOMETRY_EPSILON
  }
  class lib_gestures {
    <<module>>
    +classifyPendingGesture(d, overSheet, handle) PendingClassification
    +isInsideSheet(x, y, sheetW, sheetH) bool
    +drawPreview(origin, current) Rect
  }
  class lib_handles {
    <<module>>
    +findHandleAt(point, rect, zoom) ResizeHandle
    +applyResize(handle, origin, point) Rect
    +applyResizeCenter(...)
  }
  class lib_canvasCoords {
    <<module>>
    +screenToCanvas(point, zoom, pan) Rect
  }
  class lib_export {
    <<module>>
    +compileDocument() ExportResult
    +exportLayout() ExportResult
    +downloadLayout(layout, fileName)
    +copyLayoutToClipboard(layout)
    +importFromJson(text) ImportResult
    +clearAll() ImportResult
    -layoutToDocument(layout) MoGongDocument
  }
  class lib_api {
    <<module>>
    +compile(document)
  }

  useInteractionStore --> ActiveGesture : stores only the arbitration result
  useDocumentStore --> lib_export : consumed after toDocument
  lib_export --> lib_api : compile is the whole client, and the whole reason the server is contacted
  lib_gestures --> lib_geometry
  lib_gestures --> lib_handles
  lib_handles --> lib_geometry
  lib_canvasCoords --> lib_geometry
  useHistoryStore --> useDocumentStore : subscribes to revision
  useInteractionStore ..> useDocumentStore : one-way commit on pointer up
```

`lib_geometry` has exactly one consumer side left: the truth table and its own unit tests. Nothing in
the frontend recomputes the percentages the compiler will report any more, so `PERCENT_PRECISION` lives
only in `backend/app/schemas/layout.py` - the hand-written frontend copy went away with the last readout
that could have needed it, rather than being kept as a number nothing reads.

## 7. Sequence: drawing a rectangle

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant SV as SvgCanvas
  participant GS as lib/gestures
  participant IS as useInteractionStore
  participant DS as useDocumentStore
  participant HS as useHistoryStore
  participant LS as localStorage

  U->>SV: mouse down (left)
  SV->>SV: screenToCanvas (zoom and pan from useViewStore)
  SV->>IS: setGesture pending(origin, overSheet)
  U->>SV: mouse move x N
  SV->>GS: classifyPendingGesture(distance x zoom, overSheet, handle)
  GS-->>SV: commit-to-draw
  SV->>IS: setGesture drawing(origin, current Rect) every frame
  IS-->>SV: dashed preview only (document store untouched)
  Note over SV,DS: The load-bearing invariant: one gesture per frame, one revision per drag
  U->>SV: mouse up
  SV->>DS: applyEdit -> addElement(rect)
  DS->>DS: revision += 1
  DS->>LS: autosave the whole document
  DS-->>HS: subscriber notices the revision change
  HS->>HS: push old snapshot to past, drop future, cap at 100
  SV->>IS: setGesture idle
```

## 8. Sequence: exporting layout.json

```mermaid
sequenceDiagram
  autonumber
  participant TB as Toolbar
  participant EX as lib/export
  participant DS as useDocumentStore
  participant API as lib/api
  participant NX as Next rewrite 3000 to 8100
  participant RT as routers/compile
  participant CP as services/compiler
  participant ST as LayoutRepository
  participant FS as data/compiled

  TB->>EX: click export
  EX->>DS: toDocument(zoom, panX, panY)
  DS-->>EX: MoGongDocument
  EX->>API: api.compile(document)
  API->>NX: POST /api/compile
  NX->>RT: forwarded (no cross-origin in the browser)
  RT->>RT: Pydantic inbound checks: negative size folded, zero area refused, ids unique
  RT->>CP: compile_document(document)
  CP-->>RT: LayoutDocument (with warnings)
  RT->>ST: save_compiled(meta.id, payload, compiled_dir)
  ST->>FS: writes {id}.layout.json
  RT-->>API: CompileResponse(layout, writtenTo = filename)
  API-->>EX: ExportResult
  EX->>TB: success triggers the download, failure surfaces ApiError.message
  Note over TB,FS: The frontend infers nothing about layout. Structure has one source: Python.
```

## 9. State machine: gesture arbitration

```mermaid
stateDiagram-v2
  [*] --> idle
  idle --> pending : left button down on the sheet, records origin and overSheet
  idle --> resizing : press lands on a resize handle (the one gesture needing no arbitration)
  idle --> panning : middle button down, or left button released after a drag started off the sheet
  pending --> drawing : travelled over 3 screen pixels with the press on the sheet (commit-to-draw)
  pending --> panning : travelled over 3 screen pixels with the press off the sheet (start-panning)
  pending --> click : released under the threshold
  pending --> resizing : a handle turns out to be under the cursor
  click --> idle : select, or deselect when the press missed every element
  drawing --> idle : pointer up commits addElement
  moving --> idle : pointer up commits updateElement
  resizing --> idle : pointer up commits updateElement
  panning --> idle : any button released
  idle --> noteEditing : double click (beginNoteEditing)
  drawing --> noteEditing : double click
  noteEditing --> idle : save or Escape (endNoteEditing, canvas gestures suspended)
  note left of pending
    No state here waits on a clock. The union has no panning member either: panning is viewport
    state in useViewStore.isPanning, drawn here because that is where the user meets it.
    Moving a region is Alt+drag and never enters this arbitration at all.
  end note
```

## 10. Dev runtime and the shared test contract

```mermaid
flowchart TB
  subgraph Host["one machine - scripts/dev.sh starts both processes, Ctrl-C kills both"]
    subgraph FEP["Next.js dev :3000"]
      BR["browser connects to 3000 only, so there is no CORS to misconfigure"]
    end
    subgraph BEP["uvicorn app.main:app :8100 --reload"]
      FA["FastAPI, bound to 127.0.0.1 by default<br/>no auth, no users, no multi-tenancy"]
    end
    FS[("repo-root data/<br/>created by ensure_directories in the lifespan handler<br/>currently tracked by git, not ignored")]
  end
  SK[".qoder/skills/mogong-layout<br/>stack-neutral mold rules + per-stack adapters: react.md / vue.md / vanilla.md"]
  subgraph QA["shared golden: one drift turns both sides red"]
    GEN["scripts/generate_geometry_fixture.py<br/>make fixture"]
    FX["fixtures/cases/geometry-truth-table.json<br/>118 cases · 6 decimals · tolerance on both sides"]
    PY["pytest: test_geometry_fixture.py and 10 more"]
    VT["vitest: tests/geometry-truth-table.test.ts and others"]
    CT["test_schema_contract.py<br/>frontend and backend field names agree"]
    GEN --> FX
    FX --> PY
    FX --> VT
    PY --> CT
  end
  BR -->|"/api/:path* rewrite, MOGONG_BACKEND_ORIGIN overrides"| FA
  FA --> FS
  FS -->|"*.layout.json"| SK
```

---

## What these diagrams are asserting

- **One compile path.** Diagram 8 is the only route from a drawing to layout JSON. The moment a
  second one exists in TypeScript, diagram 3's clean split becomes a drift risk instead of a design.
- **One revision per drag.** Diagram 7's middle note is the reason undo is usable.
- **Display never edits.** The draw preview and the selection chrome read gesture state and write
  none. That is what keeps a per-frame render honest: it cannot change what it appears to measure.
- **The mold is the deliverable.** Diagram 1's last edge is the product; everything before it is
  machinery to make that edge honest.

## Known gaps these diagrams expose

| Gap | Where it shows | Status |
|-----|----------------|--------|
| `/api/layouts` CRUD and `POST /api/compile/validate` are implemented, reachable over HTTP, and called by nothing in the editor; persistence is localStorage and validation arrives inside the compiled artifact. The frontend client no longer carries a method for either, so the gap is visible instead of implied by an unused API surface | 1, 6, 8 | open, harmless for MVP; revisit if the tool goes multi-user |
| A live validation readout in the editor is specified nowhere and built by nothing; `/api/compile/validate` exists for it and is used only by the smoke test | 8 | open, and `compile.py` says so rather than claiming the editor calls it |
| `CompileError -> 500` sits oddly beside "the compiler is pure": a pure function should have no raisable path | 5 | worth auditing which branch can trigger it |
| `data/` is tracked by git while architecture.md claimed it was ignored | 10 | fixed for real on 2026-11-12: `data/` is in .gitignore and the two committed sample drawings were removed from the index |
| Fixtures pin geometry, not compiled output; there is no artifact-level parity between the two languages | 10 | by design until a TS compiler exists |
