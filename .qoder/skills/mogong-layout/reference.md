# MoGong Layout JSON — Field Reference

Detailed field-by-field reference for `mogong.layout` format version 1.0. The compiler emits this
after seven-stage processing of the user's drawings (see `docs/spec.md` §6).

## Top-level structure

```json
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
`width: 1440px`; use percentages or responsive Tailwind classes instead.

## `root` — the recursive node

Every node in the tree, root and children alike, has the same shape:

```json
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
| `spacing` | object or null             | Only present when children are non-touching and layout is row/column. |
| `align`   | object or null             | Only present when all children share an edge within 2px tolerance. |
| `children`| array                      | DOM order = draw intent. Do not reorder.                          |

## Role (inferred by §4.1 of json-schema.md)

| Role          | Condition                                             |
|---------------|-------------------------------------------------------|
| `navigation`  | Topmost child of root, full width, height < 15%       |
| `contentinfo` | Bottommost child of root, full width, height < 15%    |
| `main`        | Full width, height > 40%, has children                |
| `region`      | Direct child of root, full width, no children         |
| `container`   | Has children (generic wrapper)                        |
| `button`      | Fill set, border/radius set, no children, narrow      |
| `text`        | No fill, no border, no children, aspect ratio > 3:1   |
| `block`       | Fallback for leaf nodes                               |

Rules evaluate top to bottom; first match wins.

## Layout (inferred by §4.2)

| Value     | Condition                                                    |
|-----------|--------------------------------------------------------------|
| `none`    | Leaf node (no children)                                      |
| `row`     | Children ordered left→right with no horizontal overlap       |
| `column`  | Children ordered top→bottom with no vertical overlap         |
| `stack`   | Children overlap each other (both axes)                      |
| `free`    | None of the above holds cleanly — always paired with warning |

A container with exactly one child gets `column` (single-child wrapper has no ordering info).

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
| `fill`        | hex or null         | `null` means transparent — do NOT set a background.       |
| `fillOpacity` | 0–1                 | 1 = fully opaque. Below 1, apply `bg-opacity-XX`.         |
| `border`      | object or **null**  | `null` means no border. Absence ≠ zero-width solid.       |
| `border.style`| `"solid"`/`"dashed"`/`"dotted"` |                              |
| `border.radius`| number (px)         | Not percentage. Apply as `rounded-*` or `border-radius`.  |

## Spacing detail

```json
"spacing": {
  "axis": "row",
  "gap": 1.67,
  "unit": "%",
  "consistent": true
}
```

Present only when children have measurable, non-overlapping gaps along the primary axis.

| Field        | Type          | Notes                                                     |
|--------------|---------------|-----------------------------------------------------------|
| `axis`       | `"row"`/`"column"` | Which axis the gap applies to.                        |
| `gap`        | percentage    | If `consistent: true`, uniform gap. Otherwise, average.  |
| `consistent` | boolean       | `false` → check warnings list for outliers.               |

## Align detail

```json
"align": { "vertical": "center", "tolerancePx": 2 }
```

Detected only when **all** children of the node share the same edge or center line within 2 px.

| Field      | Values                                       |
|------------|----------------------------------------------|
| `vertical`   | `"top"`, `"center"`, `"bottom"`, or absent   |
| `horizontal` | `"left"`, `"center"`, `"right"`, or absent   |

Map to `items-*` (cross axis) or `justify-*` (main axis) depending on parent's `layout`.

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

| Code               | Meaning                                              | Consumer response                          |
|--------------------|------------------------------------------------------|----------------------------------------------|
| `PARTIAL_OVERLAP`  | Two rectangles overlap but neither contains the other | Surface to user; keep as siblings.          |
| `AMBIGUOUS_LAYOUT` | Children arrangement doesn't fit row/column/stack     | Use `layout: "free"` fallback (absolute).   |
| `ORPHAN_ELEMENT`   | Element exists but wasn't nested into any container   | Attach to root, warn the user.              |
| `INCONSISTENT_GAP` | Adjacent gaps differ significantly                    | Use individual margins, not a uniform `gap`. |
| `LOW_CONFIDENCE`   | Any other inference the compiler wasn't sure about    | Comment in code, ask user to confirm.        |

**Never silently swallow a warning.** The compiler's job is to make the drawing's ambiguity
visible; if you fix it up without telling the user, you undo the point of MoGong.

## Version compatibility

Currently only `1.0` is in the wild. If `version` is higher:

1. Do NOT guess field meanings.
2. Tell the user: "This layout uses MoGong schema version X.Y, which is newer than the skill was
   written for. Ask MoGong to re-export at 1.0, or update the skill from the repository."

Minor version bumps within `1.x` are additive — ignore unknown fields but continue processing.

## Full worked example

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

Notes on the mapping:
- `role: "main"` on root → `<main>` element (not `<div>`)
- `note` on header → JSX comment directly above the element
- `align: vertical center` + `layout: row` → `items-center`
- `spacing.gap 2.5%` → `gap-[2.5%]` (consistent)
- Header's `basis-[8%]` reflects its percentage of parent (root)
- Body's `basis-[82%]` reflects its percentage of parent
