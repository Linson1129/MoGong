# MoGong Product Specification

Version: v0.1 (MVP)
Status: Locked for M1
Owner: Product Owner (Captain) / Agent (PM + Architect)

---

## 1. Problem Statement

Independent developers who build with AI coding agents are usually precise when describing
backend work: endpoints, data flow, edge cases, test boundaries. The same precision is absent
on the frontend. Their prompts typically stop at "blue-ish, minimal style, React + Tailwind".

When the first generated result misses the mark, they do not own the vocabulary needed to
correct it. They fall back to subjective wishes - "make it feel more balanced", "the card
should breathe a bit" - and the agent regenerates something different, not something closer
to the original intent. Each round costs tokens and time and still converges nowhere.

The root cause is a lossy channel: a spatial idea in the developer's head is compressed into
imprecise prose, decompressed by the agent into a different spatial idea.

## 2. Solution

MoGong is a visual intent compiler. The developer draws rectangles on a fixed canvas and
attaches visual attributes - fill, border, nesting, notes. MoGong parses and compiles that
drawing into a structured JSON file whose geometry is measured, not described.

The developer never has to say "a bit wider than half". MoGong reports `width: 62.5%`.
The correction loop stops being a negotiation over vague language and becomes a matter of
dragging an edge.

Precise positioning is not the whole product. A rectangle's fill color, its border, and above
all its note carry intent that raw geometry cannot express - that a region is a primary
action, that a box must stay visible on scroll, that two boxes belong to the same group. The
note is therefore a first-class field, not an afterthought, and it survives compilation into
the output as readable guidance for the agent.

## 3. Scope Decision: Web Only

MoGong targets desktop web layouts. The canvas is a fixed pixel frame, default 1440 x 900.

Mobile and adaptive app screens are deliberately out of scope. A fixed canvas cannot represent
responsive breakpoints, gesture regions, or platform-safe-area semantics, and forcing it to
try would produce a worse Figma rather than a better tool for web. If mobile design becomes a
real requirement, that is a separate product decision, not a feature addition here.

## 4. Interaction Model

All interactions are on the canvas unless stated otherwise.

| Input | Action |
|-------|--------|
| Press and hold left button, then drag | Draw a new rectangle |
| Single left click | Select the element; opens the sidebar for attribute editing |
| Double left click | Enter note editing for that element |
| Right click | Open the property panel for the element, including edit and delete |
| Left drag on a selected element | Move it |
| Left drag on a resize handle | Resize it |
| Scroll wheel | Zoom the viewport, anchored at the cursor position |
| Hold middle button and drag | Pan the viewport |
| Arrow keys | Pan the viewport |
| Delete or Backspace | Delete the selected element |
| Escape | Deselect |

Long-press threshold: 180 ms of held button before the drag begins counting as a draw. Below
the threshold the gesture is a click. This threshold is a named constant, not an inline number,
so it can be retuned during usability testing.

The hold-to-draw gesture and the click-to-select gesture share the same physical input, so the
timing boundary between them is the single most important interaction detail in the product.
Getting it wrong makes the tool feel broken in a way no amount of visual polish fixes.

The delete affordance exists twice on purpose: the keyboard shortcut for people who want speed,
and a button inside the property panel for people who would not think to press a key. Redundant
discovery paths are a deliberate cost in a tool whose users arrive without frontend vocabulary.

## 5. Nesting Rule

Containment is the only nesting relation, and it is strict:

- B is a child of A if and only if B lies entirely inside A.
- Partial overlap is not nesting. It is an invalid state.
- On detecting partial overlap, MoGong shows a soft, non-blocking warning and refuses to build
  a parent-child relation. The two elements remain siblings. Nothing is auto-corrected and
  nothing is moved.
- When several elements fully contain B, the smallest such element is the parent.

Rules of this kind are written so that they can be re-derived from this document alone. If
implementation and this section ever disagree, this section is the reference.

## 6. Output Contract

MoGong produces two files, and the distinction matters.

**Document file** (`*.mogong.json`) is the editable source of truth. Absolute pixel
coordinates, viewport state, selection-independent metadata. Round-trip lossless: a document
loaded into MoGong must reproduce the drawing exactly.

**Compiled spec** (`*.layout.json`) is the agent-facing artifact. Relative coordinates as a
percentage of the parent, the nesting tree flattened of editor noise, plus the layout-mode
inference that tells the agent whether a group of children should be a row, a column, or free
positioned. This is what Cursor reads.

Geometry is relative in the compiled output because "takes 40 percent of the header width"
survives implementation, while "is 576 pixels wide" does not. The editor keeps absolute pixels
because that is what the user draws; the compiler converts because that is what the agent needs.

Full field-level definition in `docs/json-schema.md`.

## 7. Priorities

### P0 - Must ship

- Rectangle create, read, update, delete
- Sidebar for attribute editing
- Color selection
- Border selection
- Canvas interaction as specified in section 4
- Parse and compile logic producing the agent-facing JSON
- Nesting detection and the partial-overlap soft warning

### P1 - Should ship

- Save and load a layout
- Minimal, quiet UI

### P2 - Nice to have

- Interaction refinements found during testing
- Package MoGong as a Skill

## 8. Acceptance Criteria

Captain's stated acceptance bar, restated as checks:

1. Long-press drag produces a rectangle at the drawn position and size.
2. Single click selects and the sidebar reflects that element's attributes.
3. Double click opens an editable note that persists onto the element.
4. Right click opens the property panel; edit and delete both work from it.
5. Delete key removes the selected element.
6. Scroll wheel zooms around the cursor.
7. Middle-drag and arrow keys both pan the viewport.
8. Compiling a drawing yields JSON whose geometry, nesting, style, and notes match what is on
   screen - no dropped attribute, no invented relation, no coordinate drift.
9. The same JSON, handed to Cursor, produces a frontend whose layout needs no correction round.

Criterion 9 is the one that decides whether the product works. Criteria 1 through 8 only prove
the tool runs.

## 9. Constraints and Taboos

Non-negotiable, set by the product owner.

1. Conversation in Chinese.
2. Code comments, commit messages, branch names, file names, directory names: English only.
3. No emoji in documentation or commit messages.
4. Every feature lands as its own commit and is pushed, so history is traceable to a decision.
5. Smoke test at least once before each MVP checkpoint. Deep regression testing is explicitly
   not wanted - it slows delivery without catching what a smoke test would miss.

## 10. Open Questions

Tracked here so they are not silently forgotten.

| Question | Status | Decision |
|----------|----------|----------|
| Nesting on partial overlap | Resolved | Soft warning, treated as siblings |
| Which agent consumes the JSON | Resolved | Cursor first; per-agent skills later |
| Fixed or infinite canvas | Resolved | Fixed, web only |
| Default canvas size | Proposed | 1440 x 900, overridable in settings |
| Note length limit | Open | Proposed: none in editor, 500 chars in compiled output |

## 11. Expansion Directions

Out of scope for MVP. Recorded so the architecture leaves room for them, not so they get built now.

1. **Component presets** - draggable cards for button, navbar, card, form, so common regions
   skip the drawing step entirely.
2. **Multi-target export** - Tailwind classes, Figma tokens, React component skeletons
   alongside the JSON.
3. **Agent feedback loop** - the agent returns a screenshot, MoGong diffs it against the
   drawing and highlights the regions that drifted, closing the correction loop with data.
4. **Semantic annotation** - notes gain structured tags such as responsive, sticky, or
   priority, giving the agent behavioral intent that geometry cannot express.
5. **Collaboration** - multi-cursor editing and shared review of a single layout.

The compile engine is the reusable asset across all five. The canvas is replaceable; the
parser and its inference rules are not.
