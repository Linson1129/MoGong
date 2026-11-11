# MoGong Data Contract

Version: v0.1
Scope: the two JSON formats MoGong produces, and the rules that turn one into the other.

This file is the contract between the editor, the compiler, and the consuming agent. Changing a
field here is a breaking change to all three. Read `docs/spec.md` section 6 first for why the
format is split in two.

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
      "visible": true
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
| `elements[].x` | number | Absolute px from canvas left edge. May be negative if drawn off-canvas. |
| `elements[].y` | number | Absolute px from canvas top edge. |
| `elements[].width` | number | Always positive. Normalized on write: never store a negative drag. |
| `elements[].height` | number | Always positive. Normalized on write. |
| `elements[].fill.color` | string | Uppercase hex `#RRGGBB`. Always 7 chars, never shorthand. |
| `elements[].fill.opacity` | number | 0 to 1. The sidebar offers five percent steps; any value in range is accepted. |
| `elements[].border.width` | number | px. `0` means no border. |
| `elements[].border.style` | enum | `none`, `solid`, `dashed`, `dotted`. |
| `elements[].border.radius` | number | px. |
| `elements[].note` | string | Free text, no limit in the document. The user's raw intent. |
| `elements[].locked` | boolean | A locked element ignores canvas gestures. |

`elements` is a **flat array with no parent field**. The tree exists only in the compiled output.
The document stores what the user drew; derivation happens at compile time.

Why flat: a stored `parentId` can go stale the moment a drag changes containment, and every edit
path would have to remember to repair it. Deriving the tree from geometry each compile means there
is exactly one place where nesting logic lives, and it cannot drift out of sync with the drawing.

## 2. Compiled Format - `*.layout.json`

The agent-facing artifact. This is what Cursor reads. Tree-structured, relative geometry,
inference included.

```json
{
  "format": "mogong.layout",
  "version": "1.0",
  "meta": {
    "name": "homepage-hero",
    "source": "MoGong",
    "generatedAt": "2026-11-11T10:05:00Z"
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
    "style": { "fill": "#FFFFFF", "border": null },
    "note": null,
    "children": [
      {
        "id": "e_01",
        "name": "Header",
        "role": "navigation",
        "box": { "x": 0, "y": 0, "width": 100, "height": 8, "unit": "%" },
        "layout": "row",
        "style": {
          "fill": "#1E293B",
          "border": { "width": 1, "style": "solid", "color": "#0F172A", "radius": 0 }
        },
        "note": "Sticky top bar, stays visible on scroll",
        "children": [
          {
            "id": "e_02",
            "name": "Logo",
            "role": "image",
            "box": { "x": 2, "y": 27.78, "width": 8.33, "height": 44.44, "unit": "%" },
            "layout": "none",
            "style": { "fill": "#334155", "border": null },
            "note": null,
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
| `role` | enum | Inferred. See section 4.1. |
| `layout` | enum | Inferred. See section 4.2. The single most valuable field in the output. |
| `style.border` | object or null | `null` when the element has no border, so the agent reads absence, not a zero value. |
| `note` | string or null | Verbatim user text. Never rewritten, never summarized by the compiler. |
| `warnings` | array | Every inference the compiler could not resolve. Empty array means a clean drawing. |

`layout: "row"` on the Header does not assert "use flex-direction: row". It asserts "these
children sit side by side, and their horizontal order is the DOM order". The agent chooses the
implementation; MoGong only rules out guessing.

## 3. Units and Precision

Percentages are the default, not pixels, because pixel values in the output become liabilities the
moment the agent picks a different container width.

Two exceptions stay in pixels, marked explicitly at the field:

- `canvas.width` and `canvas.height` - the design reference frame.
- `border.width` and `border.radius` - decorative values that do not scale with a container.

Rounding: 2 decimal places on every percentage. Beyond that, precision is noise the user never
drew, and it invites the agent into false exactness. Sub-pixel accuracy in a hand-drawn rectangle
is not information, it is jitter.

## 4. Inference Rules

The compiler derives things the user never typed. Each rule is listed so a wrong guess can be
traced back to it and argued about.

### 4.1 Role

Based on the element's own geometry and its position in the tree.

| Condition | Role |
|-----------|------|
| Topmost direct child of root, full width, height under 15 percent of canvas | `navigation` |
| Bottommost direct child of root, full width, height under 15 percent | `contentinfo` |
| Full width, height over 40 percent, has children | `main` |
| Direct child of root, full width, no children | `region` |
| Has children | `container` |
| Fill color set, border or radius set, no children, width under 25 percent of parent | `button` |
| No fill, no border, no children, aspect ratio over 3 to 1 | `text` |
| Otherwise, no children | `block` |

Rules are evaluated top to bottom; the first match wins.

Role is a hint the agent may override. It is a convenience, not a constraint, and a wrong guess
costs the agent nothing but a rename.

### 4.2 Layout mode

Decided from the arrangement of a node's children.

| Condition | Layout |
|-----------|--------|
| No children | `none` |
| No two children overlap in both axes | `row` if children do not vertically stack either, else see next |
| Children ordered left to right with no horizontal overlap | `row` |
| Children ordered top to bottom with no vertical overlap | `column` |
| Children overlap each other | `stack` |
| None of the above holds cleanly | `free`, with a warning |

A container with exactly one child gets that child's implicit direction, `column`, because a
one-child wrapper carries no ordering information to preserve.

`free` is the honest answer when a drawing is ambiguous. It comes with a warning naming the
elements, so the user learns the drawing did not read the way they intended - which is precisely
the failure mode MoGong exists to eliminate. Silent wrong confidence would reintroduce it.

### 4.3 Sibling gaps

When adjacent siblings in a row or column do not touch, the compiler emits the measured gap so
spacing is data rather than another guess.

```json
{
  "spacing": { "axis": "row", "gap": 1.67, "unit": "%", "consistent": true }
}
```

`consistent` is false when gaps differ, and `gap` is then the average with a warning listing the
outliers. A designer who drew 16 px and 40 px gaps in the same row meant something, and averaging
them without saying so would erase that.

### 4.4 Alignment

Detected when direct children share an edge or a center line within a 2 px tolerance.

```json
{ "align": { "vertical": "center", "tolerancePx": 2 } }
```

Reported only when it holds for all children of a node, because a partial alignment is jitter,
not intent.

## 5. Validation

Both formats validate against a machine-checkable schema in `backend/app/schemas/`.

Document rules:

- `width` and `height` are positive.
- `fill.color` matches `^#[0-9A-F]{6}$`.
- Element ids are unique.
- `width` is the single authority on whether a border exists. The validator rewrites `style` to
  `"none"` whenever `width` is zero, and to `"solid"` whenever a positive width arrives with
  `style: "none"`. After normalization, `style: "none"` and `width: 0` are equivalent; the two
  forms never coexist in a stored document.

Compiled rules:

- Every element from the document appears exactly once in the tree or in a warning.
  No element may be silently dropped. This is the invariant that catches nesting bugs.
- Sibling percentages on one axis sum to at most 100 unless layout is `stack` or `free`.
- `warnings` is present even when empty.

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

## 7. Cursor Consumption

MVP targets Cursor only. The file is written to `data/layouts/` and the user attaches it to the
prompt. What Cursor needs from it:

- The `root` tree and relative boxes, which are the layout.
- `layout` and `role`, which are the structural decisions.
- `note`, which carries intent geometry cannot hold.
- `warnings`, which tell the user the drawing was ambiguous before the agent builds on it.

The compiler emits no prose. Instructions to the agent belong in a Skill wrapper, which is P2,
not baked into the data. Data stays neutral so the same JSON can feed a different agent later
without a rewrite.
