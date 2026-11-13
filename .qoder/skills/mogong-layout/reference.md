# MoGong Layout JSON — Field Reference

Detailed field-by-field reference for `mogong.layout` format version 1.0. The compiler emits this
after seven-stage processing of the user's drawings (see `docs/spec.md` §6).

## Top-level structure

```jsonc
{
  "format": "mogong.layout",
  "version": "1.0",
  "meta":    { /* source document info */ },
  "canvas":  { /* design reference frame */ },
  "root":    { /* the layout tree */ },
  "warnings": [ /* ambiguous inferences */ ]
}
```

## `meta`

| Field         | Type   | Notes                                                    |
|---------------|--------|----------------------------------------------------------|
| `name`        | string | Original document name, from the editor's title bar.     |
| `source`      | string | Always `"MoGong"`.                                       |
| `generatedAt` | string | ISO 8601 timestamp with timezone.                        |

Use `meta.name` for the component's display name.

## `canvas`

| Field        | Type             | Notes                                                     |
|--------------|------------------|-----------------------------------------------------------|
| `width`      | number (px)      | Design reference width — e.g. 1440 for desktop.          |
| `height`     | number (px)      | Design reference height.                                  |
| `background` | hex string       | Canvas-level fill, distinct from root's own style.        |
| `platform`   | enum             | `"web-desktop"`, `"web-mobile"`, `"tablet"`. Breakpoint hint. |

`canvas.width` is the **frame of reference**, not a fixed width to enforce. Do not generate
`width: 1440px`; express the layout in percentages, fractional grid tracks, or the target stack's
responsive units instead.

## `root` — the recursive node

Every node in the tree, root and children alike, has the same shape:

```jsonc
{
  "id":       "el-<base36>",
  "name":     "Header",
  "role":     "navigation",
  "box":      { "x": 0, "y": 0, "width": 100, "height": 8, "unit": "%" },
  "layout":   "row",
  "style":    { "fill": "#1E293B", "fillOpacity": 1, "border": null },
  "note":     "顶部导航栏",
  "spacing":  { "axis": "row", "gap": 2.5, "unit": "%", "consistent": true },
  "align":    { "vertical": "center", "tolerancePx": 2 },
  "children": [ /* same-shape nodes */ ]
}
```

### Field semantics

| Field     | Type                       | Meaning                                                          |
|-----------|----------------------------|------------------------------------------------------------------|
| `id`      | string                     | Stable identifier from the editor. Only useful for tracing.      |
| `name`    | string                     | User-assigned label; often Chinese. Suggested as `aria-label`.   |
| `role`    | enum (see §Role below)     | Semantic hint, overridable by the consumer agent.                |
| `box`     | object                     | **Percentage of parent's box**, 2-decimal rounded.               |
| `layout`  | enum (see §Layout below)   | Inferred arrangement mode of the node's children.                |
| `style`   | object                     | Fill color, opacity, border specification.                        |
| `note`    | string or null             | Verbatim user text. Never rewrite, never summarize.              |
| `spacing` | object or null             | Key always present; `null` unless gaps were measured (row/column, 2+ children, non-touching). |
| `align`   | object or null             | Key always present; `null` unless every child shared an edge or center line within 2 px. |
| `children`| array                      | DOM order = draw intent. Do not reorder.                          |

## Role (inferred by §4.1 of json-schema.md)

`full width` means 95% or more of the parent's width. The top and bottom tests are bands of the
canvas: top edge inside the first 15% of canvas height, or bottom edge past 85%.

| Role          | Condition                                                       |
|---------------|-----------------------------------------------------------------|
| `navigation`  | Direct child of root, full width, height < 15%, in the top band  |
| `contentinfo` | Direct child of root, full width, height < 15%, in the bottom band |
| `main`        | Full width, height > 40%, has children                          |
| `region`      | Direct child of root, full width, no children                   |
| `container`   | Has children (generic wrapper)                                  |
| `button`      | Non-white fill or opacity < 1, **visible border**, width < 25% of parent |
| `text`        | Plain white fill at full opacity, no border, aspect ratio > 3:1 |
| `block`       | Fallback for everything else                                    |

Rules evaluate top to bottom; first match wins, so `button` and `text` only ever see leaves.
The synthetic root is always `region`. `image` exists in the enum but **no rule emits it** — treat
it as reserved, and never assume a stamp became an `image`.

Radius is not part of the `button` test: `radius > 0` is still a signal worth honoring, but it does
not make a rectangle a button.

## Layout (inferred by §4.2)

| # | Value     | Condition                                                    |
|---|-----------|--------------------------------------------------------------|
| 1 | `none`    | Leaf node (no children)                                      |
| 2 | `column`  | Exactly one child                                            |
| 3 | `row`     | No two children overlap horizontally                         |
| 4 | `column`  | No two children overlap vertically                            |
| 5 | `stack`   | Some pair overlaps in both axes                              |
| 6 | `free`    | None of the above holds — always paired with a warning       |

Numbered on purpose: the rules are tested in this order, so a row of boxes at different heights
answers 3 before it ever reaches 4.

A container with exactly one child gets `column` (single-child wrapper has no ordering info).
Children are sorted by `(y, x)` — top to bottom, then left to right — so the emitted order is a
reading order, not necessarily a left-to-right order when a row is staggered.

## Style details

```json
"style": {
  "fill": "#86EFAC",
  "fillOpacity": 1.0,
  "border": {
    "width": 1.0,
    "style": "dashed",
    "color": "#64748B",
    "radius": 0.0
  }
}
```

| Field         | Type                | Notes                                                     |
|---------------|---------------------|-----------------------------------------------------------|
| `fill`        | hex                 | The editor always writes a hex; `null` appears only in hand-authored files. Either way it is a grouping signal, not a palette. |
| `fillOpacity` | 0–1                 | 1 = fully opaque. Below 1, use a translucent background color (Tailwind 4: `bg-slate-500/40`; CSS: `rgb(2 6 23 / 40%)` or `color-mix()`), not an `opacity` on the whole element. |
| `border`      | object or **null**  | `null` means no border. Absence ≠ zero-width solid.       |
| `border.style`| `"solid"`/`"dashed"` | Only these two. In the editor they mean fixed (solid) vs collapsible (dashed) — neither is a style choice for the site. |
| `border.radius`| number (px)         | Not percentage. Express as a corner-radius token in whatever styling the target project uses. |

## Spacing detail

```json
"spacing": {
  "axis": "row",
  "gap": 1.67,
  "unit": "%",
  "consistent": true
}
```

Present only when children have measurable, non-overlapping gaps along the primary axis. `gap` is
a percentage of the container's own width (row) or height (column).

| Field        | Type          | Notes                                                     |
|--------------|---------------|-----------------------------------------------------------|
| `axis`       | `"row"`/`"column"` | Which axis the gap applies to.                        |
| `gap`        | percentage    | If `consistent: true`, uniform gap. Otherwise, average.  |
| `consistent` | boolean       | `false` → the widest and narrowest gap differ by 1 percentage point or more; the `INCONSISTENT_GAP` warning names the whole sibling group, not just the outliers. |

## Align detail

```json
"align": { "horizontal": "left", "vertical": null, "tolerancePx": 2 }
```

Detected only when **all** children of the node share the same edge or center line within 2 px.
Both keys are always present; the ones that did not match are `null`.

| Field        | Values                                       |
|--------------|----------------------------------------------|
| `vertical`   | `"top"`, `"middle"`, `"bottom"`, or `null`   |
| `horizontal` | `"left"`, `"center"`, `"right"`, or `null`   |

Note the asymmetry: a shared horizontal center reads `"center"`, a shared vertical center reads
`"middle"`. Map to the cross-axis or main-axis alignment property of the parent's `layout`
(`align-items` / `justify-content` in CSS, `items-*` / `justify-*` in Tailwind).

## Warnings

The `warnings` array is always present, possibly empty. Each entry has:

```json
{
  "code": "PARTIAL_OVERLAP",
  "elements": ["e_05", "e_06"],
  "message": "e_05 and e_06 partially overlap. Treated as siblings, neither contains the other."
}
```

### Warning codes and required response

The authoritative enum is `LayoutWarningCode` in `backend/app/schemas/layout.py`. Codes outside it do
not exist; if you find yourself reasoning about `ORPHAN_ELEMENT` or `LOW_CONFIDENCE`, you are recalling
a stale draft.

| Code               | Meaning                                              | Consumer response                          |
|--------------------|------------------------------------------------------|----------------------------------------------|
| `PARTIAL_OVERLAP`  | Two rectangles overlap but neither contains the other | Surface to user; keep as siblings.          |
| `AMBIGUOUS_LAYOUT` | No row/column/stack rule matched the children        | **Not** a licence to absolute-position. Read `name` + `note`, express the grouping in the target stack's normal layout, and say so in the delivery notes. |
| `INCONSISTENT_GAP` | Adjacent gaps differ by 1 percentage point or more   | Use per-item gaps, not one uniform value.    |
| `OFF_CANVAS`       | An element lies outside the canvas frame             | Surface to user; ask whether to drop it or resize the canvas. |
| `EMPTY_DOCUMENT`   | Nothing was drawn                                    | Stop and tell the user; do not invent a layout. |
| `ELEMENT_DROPPED`  | An element vanished during compilation               | Treat as a compiler bug: report the element id, do not rebuild without it. |

The `/validate` endpoint reports a different, non-overlapping set (`ProblemCode` in
`backend/app/services/validate.py`: `ELEMENT_TOO_SMALL`, `DUPLICATE_GEOMETRY`, ...). Do not mix the two
lists when talking to the user.

**Never silently swallow a warning.** The compiler's job is to make the drawing's ambiguity
visible; if you fix it up without telling the user, you undo the point of MoGong.

## Version compatibility

Currently only `1.0` is in the wild. If `version` is higher:

1. Do NOT guess field meanings.
2. Tell the user: "This layout uses MoGong schema version X.Y, which is newer than the skill was
   written for. Ask MoGong to re-export at 1.0, or update the skill from the repository."

Minor version bumps within `1.x` are additive — ignore unknown fields but continue processing.

## Full worked example

The output below is shown in **React form** only to demonstrate the reading process. Per-stack
equivalents live in `react.md`, `vue.md` and `vanilla.md`; the mapping rules shown in the notes are
stack-neutral.

Input JSON (abbreviated for readability):

```json
{
  "format": "mogong.layout",
  "version": "1.0",
  "meta": { "name": "dashboard", "source": "MoGong" },
  "canvas": { "width": 1440, "height": 900, "background": "#F8FAFC", "platform": "web-desktop" },
  "root": {
    "id": "root",
    "name": "Page",
    "role": "main",
    "box": { "x": 0, "y": 0, "width": 100, "height": 100, "unit": "%" },
    "layout": "column",
    "style": { "fill": "#F8FAFC", "fillOpacity": 1, "border": null },
    "children": [
      {
        "id": "el-header",
        "name": "Header",
        "role": "navigation",
        "box": { "x": 0, "y": 0, "width": 100, "height": 8, "unit": "%" },
        "layout": "row",
        "style": { "fill": "#1E293B", "fillOpacity": 1, "border": null },
        "note": "Sticky top bar, stays visible on scroll",
        "spacing": { "axis": "row", "gap": 2.5, "unit": "%", "consistent": true },
        "align": { "vertical": "center", "tolerancePx": 2 },
        "children": []
      },
      {
        "id": "el-body",
        "name": "Body",
        "role": "container",
        "box": { "x": 0, "y": 10, "width": 100, "height": 82, "unit": "%" },
        "layout": "row",
        "style": { "fill": null, "fillOpacity": 1, "border": null },
        "note": null,
        "children": []
      }
    ]
  },
  "warnings": []
}
```

Generated component:

```tsx
export default function Dashboard() {
  return (
    <main className="flex flex-col w-full min-h-screen bg-[#F8FAFC]">
      {/* Sticky top bar, stays visible on scroll */}
      <nav className="flex flex-row w-full basis-[8%] gap-[2.5%] items-center bg-[#1E293B]">
        {/* children would be rendered here */}
      </nav>

      <div className="flex flex-row w-full basis-[82%]">
        {/* children would be rendered here */}
      </div>
    </main>
  );
}
```

Notes on the mapping (the class names below are the Tailwind spelling; the decisions themselves are
stack-neutral — see the adapter files for the equivalent in Vue or plain CSS):
- `role: "main"` on root → `<main>` element (not `<div>`)
- `note` on header → JSX comment directly above the element
- `align: vertical center` + `layout: row` → `items-center`
- `spacing.gap 2.5%` → `gap-[2.5%]` (consistent)
- Header's `basis-[8%]` reflects its percentage of parent (root)
- Body's `basis-[82%]` reflects its percentage of parent
