# MoGong Data Contract

Version: v0.2
Scope: the two JSON formats MoGong produces, and the rules that turn one into the other.

This file is the contract between the editor, the compiler, and the consuming agent. Changing a
field here is a breaking change to all three. Read `docs/spec.md` section 6 first for why the
format is split in two.

The executable form of this contract is `backend/app/schemas/document.py` (section 1) and
`backend/app/schemas/layout.py` (section 2); section 4 is implemented in
`backend/app/services/infer/`. Every field name, enum value, default and normalization rule below
was re-read off that code rather than off the previous draft of this file, and
`backend/tests/test_schema_contract.py` pins the normalization behavior. Where the prose and the
code disagreed, the prose was wrong.

---

## 1. Document Format - `*.mogong.json`

The editable source of truth. Written by the frontend, read by the frontend. Absolute pixels,
editor state, nothing inferred.

```json
{
  "format": "mogong.document",
  "version": "1.0",
  "meta": {
    "id": "d480f2c1-9a1e-4f3b-8c25-7a0b9e6d1c42",
    "name": "homepage-hero",
    "createdAt": "2026-11-11T09:30:00Z",
    "updatedAt": "2026-11-11T10:02:41Z"
  },
  "canvas": {
    "width": 1440,
    "height": 900,
    "background": "#FFFFFF",
    "gridSize": 8,
    "snapToGrid": true
  },
  "elements": [
    {
      "id": "e_01",
      "name": "Header",
      "x": 0,
      "y": 0,
      "width": 1440,
      "height": 72,
      "fill": { "color": "#1E293B", "opacity": 1 },
      "border": { "width": 1, "style": "solid", "color": "#0F172A", "radius": 0 },
      "note": "Sticky top bar, stays visible on scroll",
      "locked": false,
      "visible": true,
      "stamp": false
    }
  ],
  "viewport": {
    "zoom": 1,
    "panX": 0,
    "panY": 0
  }
}
```

### Field notes

| Field | Type | Notes |
|-------|------|-------|
| `elements` | array | At most 1000 items (`MAX_ELEMENTS` in `backend/app/schemas/document.py`), enforced where the request body is parsed so an oversized document is refused before the compiler starts. Nesting compares regions pairwise, which is the only reason the count needs a ceiling at all: nobody draws a thousand regions by hand. |
| `elements[].x` | number | Absolute px from canvas left edge. May be negative if drawn off-canvas. |
| `elements[].y` | number | Absolute px from canvas top edge. |
| `elements[].width` | number | Always positive. A reverse drag is folded on write by moving `x` to the opposite edge, so no consumer ever sees an inverted rectangle. |
| `elements[].height` | number | Always positive. Folded the same way, against `y`. |
| `elements[].fill.color` | string | Uppercase 6-digit hex `#RRGGBB`. Shorthand (`#abc`) and lowercase are accepted as input and expanded, so a stored color has exactly one spelling. Anything else is rejected. |
| `elements[].fill.opacity` | number | 0 to 1, honored by the renderer and carried into the compiled style. The panel offers no opacity control today, so in practice it stays 1 unless a document arrives by import or by hand. |
| `elements[].border.width` | number | px. `0` means no border - width is the only authority on whether a border exists. |
| `elements[].border.style` | enum | `solid` or `dashed`. `solid` marks a fixed region, `dashed` a collapsible one. When width is 0 the style is pinned to `solid`, so the invisible state has one spelling. |
| `elements[].border.radius` | number | px. |
| `elements[].note` | string or null | Free text, no limit in the document. The user's raw intent. Newlines survive. |
| `elements[].locked` | boolean | A locked element ignores canvas gestures. |
| `elements[].visible` | boolean | `false` drops it from the canvas and from hit testing, but it stays in the document and still compiles into the tree. The appearance panel toggles it (可见 / 隐藏). |
| `elements[].stamp` | boolean | `true` when the drag ended with both extents under 32 px: an icon rather than a region. Rendered as a circle, note shown as a side label. Set by the editor, never by the compiler. |
| `viewport` | object | Editor camera: `zoom` (above 0, at most 8.0), `panX`, `panY`. Persisted so a layout reopens as it was left, and deliberately excluded from compilation - the agent must not learn how far the user had zoomed. |

`elements` is a **flat array with no parent field**. The tree exists only in the compiled output.
The document stores what the user drew; derivation happens at compile time.

Why flat: a stored `parentId` can go stale the moment a drag changes containment, and every edit
path would have to remember to repair it. Deriving the tree from geometry each compile means there
is exactly one place where nesting logic lives, and it cannot drift out of sync with the drawing.

## 2. Compiled Format - `*.layout.json`

The agent-facing artifact. This is what the consuming agent reads, together with the Skill described
in section 7. Tree-structured, relative geometry, inference included.

```json
{
  "format": "mogong.layout",
  "version": "1.0",
  "meta": {
    "name": "homepage-hero",
    "source": "MoGong",
    "generatedAt": "2026-11-11T10:05:00.123456+00:00"
  },
  "canvas": {
    "width": 1440,
    "height": 900,
    "background": "#FFFFFF",
    "platform": "web-desktop"
  },
  "root": {
    "id": "root",
    "name": "Page",
    "role": "region",
    "box": { "x": 0, "y": 0, "width": 100, "height": 100, "unit": "%" },
    "layout": "column",
    "style": { "fill": "#FFFFFF", "fillOpacity": 1, "border": null },
    "note": null,
    "spacing": null,
    "align": null,
    "children": [
      {
        "id": "e_01",
        "name": "Header",
        "role": "navigation",
        "box": { "x": 0, "y": 0, "width": 100, "height": 8, "unit": "%" },
        "layout": "column",
        "style": {
          "fill": "#1E293B",
          "fillOpacity": 1,
          "border": { "width": 1, "style": "solid", "color": "#0F172A", "radius": 0 }
        },
        "note": "Sticky top bar, stays visible on scroll",
        "spacing": null,
        "align": null,
        "children": [
          {
            "id": "e_02",
            "name": "Logo",
            "role": "block",
            "box": { "x": 2, "y": 27.78, "width": 8.33, "height": 44.44, "unit": "%" },
            "layout": "none",
            "style": { "fill": "#334155", "fillOpacity": 1, "border": null },
            "note": null,
            "spacing": null,
            "align": null,
            "children": []
          }
        ]
      }
    ]
  },
  "warnings": [
    {
      "code": "PARTIAL_OVERLAP",
      "elements": ["e_05", "e_06"],
      "message": "e_05 and e_06 partially overlap. Treated as siblings, neither contains the other."
    }
  ]
}
```

### Field notes

| Field | Type | Notes |
|-------|------|-------|
| `box.x` | number | Percent of parent width, from parent left edge. Rounded to 2 decimals. |
| `box.y` | number | Percent of parent height, from parent top edge. |
| `box.width` | number | Percent of parent width. |
| `box.height` | number | Percent of parent height. |
| `box.unit` | enum | `%` is the only value today. It is carried per box so that a pixel unit can arrive as an additive change; a reader must not assume it has seen every value. |
| `role` | enum | Inferred. See section 4.1. One of `navigation`, `contentinfo`, `main`, `region`, `container`, `button`, `text`, `block`. `image` is in the enum and no rule emits it yet. |
| `layout` | enum | Inferred. See section 4.2. The single most valuable field in the output. |
| `style.fill` | string or null | The element's own fill; the root carries the canvas background. |
| `style.fillOpacity` | number | Always present, `1` when untouched. |
| `style.border` | object or null | `null` when the element has no border (width 0), so the agent reads absence, not a zero value. |
| `spacing` | object or null | Present as a key on every node, `null` when nothing was measured. See section 4.3. |
| `align` | object or null | Same rule as `spacing`. See section 4.4. |
| `note` | string or null | Verbatim user text, newlines and all. Never rewritten, never summarized by the compiler. |
| `warnings` | array | Every inference the compiler could not resolve. Empty array means a clean drawing. |
| `meta.generatedAt` | string or null | ISO 8601 from `datetime.now(UTC).isoformat()`, so an explicit `+00:00` offset and microsecond precision, not a `Z` suffix. It changes on every compile and is not an identifier. |

`layout: "column"` on the Header does not assert "use flex-direction: column". It asserts "these
children stack in this vertical order, and that order is the DOM order". The agent chooses the
implementation; MoGong only rules out guessing.

## 3. Units and Precision

Percentages are the default, not pixels, because pixel values in the output become liabilities the
moment the agent picks a different container width.

Two exceptions stay in pixels, marked explicitly at the field:

- `canvas.width` and `canvas.height` - the design reference frame.
- `border.width` and `border.radius` - decorative values that do not scale with a container.
- `align.tolerancePx` - the margin the measurement itself used, which is meaningless as a ratio of
  a container.

Rounding: 2 decimal places on every percentage. Beyond that, precision is noise the user never
drew, and it invites the agent into false exactness. Sub-pixel accuracy in a hand-drawn rectangle
is not information, it is jitter.

## 4. Inference Rules

The compiler derives things the user never typed. Each rule is listed so a wrong guess can be
traced back to it and argued about.

### 4.1 Role

Based on the element's own geometry and its position in the tree. Implemented in
`backend/app/services/infer/roles.py`; the synthetic root is `region` by definition and is not run
through the rules.

Two terms the table uses: **full width** means 95 percent or more of the parent's width (of the
canvas, for a direct child of root), and the top and bottom tests are bands - the element's top
edge inside the first 15 percent of canvas height, or its bottom edge past 85 percent.

| # | Condition | Role |
|---|-----------|------|
| 1 | Direct child of root, full width, height under 15 percent of canvas, top edge in the top band | `navigation` |
| 2 | Direct child of root, full width, height under 15 percent, bottom edge in the bottom band | `contentinfo` |
| 3 | Full width, height over 40 percent of canvas, has children | `main` |
| 4 | Direct child of root, full width, no children | `region` |
| 5 | Has children | `container` |
| 6 | Fill is not plain white or opacity below 1, border visible, width under 25 percent of parent | `button` |
| 7 | Plain white fill at full opacity, no visible border, aspect ratio over 3 to 1 | `text` |
| 8 | Everything else | `block` |

Rules are evaluated top to bottom; the first match wins. That ordering is load-bearing: rules 6 and
7 only ever see leaf elements because rule 5 already caught anything with children.

`image` is a member of the enum and no rule emits it. An icon stamp carries no more evidence of
being an image than any other small rectangle, and inventing a role the geometry does not support
is the guessing this file exists to prevent. A consumer should treat `image` as reserved.

Role is a hint the agent may override. It is a convenience, not a constraint, and a wrong guess
costs the agent nothing but a rename.

### 4.2 Layout mode

Decided from the arrangement of a node's children, tested in this order:

| # | Condition | Layout |
|---|-----------|--------|
| 1 | No children | `none` |
| 2 | Exactly one child | `column` |
| 3 | No two children overlap horizontally | `row` |
| 4 | No two children overlap vertically | `column` |
| 5 | Some pair overlaps in both axes | `stack` |
| 6 | None of the above | `free`, with an `AMBIGUOUS_LAYOUT` warning naming the children |

The order matters. Rule 3 before rule 4 means a row of boxes at different heights is `row` - they
do not overlap sideways, even though they also do not stack. Children are sorted by `(y, x)` when
the tree is built (`_sort_children_by_position` in `backend/app/services/nesting.py`): top to
bottom, then left to right. A row drawn at exactly one height therefore comes out left to right,
and a staggered row comes out top first - which is why `row` asserts "this order is the DOM order"
rather than "these read left to right".

A container with exactly one child gets `column`, because a one-child wrapper carries no ordering
information to preserve.

`free` is the honest answer when a drawing is ambiguous. It comes with a warning naming the
elements, so the user learns the drawing did not read the way they intended - which is precisely
the failure mode MoGong exists to eliminate. Silent wrong confidence would reintroduce it.

### 4.3 Sibling gaps

When adjacent siblings in a `row` or `column` do not touch, the compiler emits the measured gap so
spacing is data rather than another guess.

```json
{ "spacing": { "axis": "row", "gap": 1.67, "unit": "%", "consistent": true } }
```

- `axis` repeats the container's layout mode, because the gap is meaningless without knowing which
  axis it was measured along.
- `gap` is a percentage of the container's own width (row) or height (column), averaged over the
  adjacent pairs and rounded to 2 decimals.
- `spacing` stays `null` when there are fewer than two children, when the layout is `stack` or
  `free` (sequential gaps say nothing there), when every measured gap is under 0.1 percent
  (touching siblings read as one block, not as a spaced row), and on the root node.
- `consistent` is true when the widest and narrowest gap differ by less than 1 percentage point.
- When it is false, `gap` is still the average and an `INCONSISTENT_GAP` warning names the whole
  sibling group. A designer who drew 16 px and 40 px gaps in the same row meant something; the
  average is reported so the agent has a number, and the warning is what says the number is a
  compromise rather than an observation.

### 4.4 Alignment

Detected when all direct children share an edge or a center line within the tolerance.

```json
{ "align": { "horizontal": "left", "vertical": null, "tolerancePx": 2 } }
```

`horizontal` is `left`, `right` or `center`; `vertical` is `top`, `bottom` or `middle`. Either one
is `null` when nothing matched on that axis, and the whole `align` is `null` when both missed.
`tolerancePx` is always the value the measurement used (`ALIGNMENT_TOLERANCE_PX = 2.0`), so a
reader can tell a tight alignment from a lucky one instead of guessing.

Like spacing, alignment is measured only for `row` and `column` containers with two or more
children, and never on the root. It is reported only when it holds for all children of a node,
because a partial alignment is jitter, not intent.

## 5. Validation

Both formats validate at the API boundary in `backend/app/schemas/`. `extra="forbid"` is set on
every model, so an unknown key is a hard failure rather than a silent missing value - a renamed
field that lands as `None` is how a layout quietly loses information.

Document rules, enforced in `backend/app/schemas/document.py` (an invalid document is a 422, never
a half-stored file):

- `width` and `height` are positive. A reverse drag is folded into the equivalent forward rect at
  the origin; a zero-area rectangle is refused outright, because the percentage conversion divides
  by it.
- `fill.color`, `border.color` and `canvas.background` match `^#[0-9A-F]{6}$` after normalization;
  shorthand and lowercase inputs are expanded rather than rejected.
- Element ids are unique.
- `border.width` is the single authority on whether a border exists. `style` says only what a
  visible border looks like, so a zero width pins the style to `solid`. After normalization
  `{"width": 0}` has exactly one spelling, and the compiler never has to decide whether
  `{"width": 0, "style": "dashed"}` was an intent or a leftover.

`backend/app/services/validate.py` is a different job and does not reject anything: `check_document`
returns advisory findings for the editor (off-canvas, under 2 px, duplicate geometry, empty
canvas), and a drawing is never altered on the user's behalf.

Compiled rules:

- Every element from the document appears exactly once in the tree or in a warning.
  No element may be silently dropped. This is the invariant that catches nesting bugs.
- Sibling percentages on one axis sum to at most 100 unless layout is `stack` or `free`.
- `warnings` is present even when empty, and `spacing` and `align` are present as keys even when
  nothing was measured: a reader must be able to tell "checked, found nothing" from "not
  implemented".
- An element with `visible: false` still appears. Hiding is an editor convenience, not a statement
  about the design.

The "no element silently dropped" invariant is worth calling out. It is the check that turns a
whole class of compiler bug into a test failure instead of a user discovering that a rectangle
they drew vanished from the JSON. It is cheap to assert and it is the first test written for the
compiler, not the last.

## 6. Versioning

`format` and `version` sit at the top of both files.

- Minor version: additive fields. Readers ignore what they do not know.
- Major version: a field changes meaning or is removed. A reader on the older version must
  refuse rather than misinterpret.

The consuming agent reads `version` before parsing anything else. Silent misread of a layout is
the worst possible failure here: it produces confidently wrong frontend code, which is the exact
problem MoGong was built to end.

## 7. Consuming the Artifact

Compiled output is written to `data/compiled/{document id}.layout.json`; editable documents live
in `data/layouts/{id}.mogong.json`. Two directories on purpose: compiled files are derived data,
and storing them beside documents would make it possible to load stale output as if it were an
editable layout. The user attaches the layout file to a prompt. `docs/spec.md` section 10 once named
Cursor as the first consumer; that decision is superseded - the Skill is what actually shipped, and
no Cursor integration exists. The format itself names no agent. What a consumer needs from
the file:

- The `root` tree and relative boxes, which are the layout.
- `layout` and `role`, which are the structural decisions.
- `note`, which carries intent geometry cannot hold.
- `warnings`, which tell the user the drawing was ambiguous before the agent builds on it.

The compiler emits no prose. Instructions to the agent live in a Skill wrapper instead -
`.qoder/skills/mogong-layout/SKILL.md`, which states what the mold decides, what it leaves to the
agent, and the failure modes to avoid. Data stays neutral so the same JSON can feed a different
agent later without a rewrite.

The mold names no framework either, and that neutrality is load-bearing in the same way. `layout:
"row"` means the same thing in React, Vue or hand-written CSS, so the stack-specific spelling lives
in per-stack adapters (`react.md`, `vue.md`, `vanilla.md`) while the rules stay in `SKILL.md`. An
adapter that hardcoded a framework into the rules would silently reject every non-React project.

One consequence of pairing the two: the literals that let an agent find the Skill belong to this
contract. A Skill is selected by matching its description against the request, and that description
quotes `mogong.layout`, the `*.layout.json` suffix and the field vocabulary above. Renaming `format`
or the suffix would break discovery while every test in the suite still passes. `spec.md` section 8
criterion 9 is deliberately stated about the pair for the same reason.
