---
name: mogong-layout
description: Convert MoGong compiled layout JSON (*.layout.json with format "mogong.layout") into React + Tailwind CSS code. Use when the user attaches or pastes a MoGong layout JSON, mentions "墨工输出", "layout.json", or asks to generate frontend code from a visual layout specification.
---

# MoGong Layout Consumer

Turn MoGong's compiled `*.layout.json` into a working React + Tailwind component. The JSON is a
**structured intent**, not a pixel-perfect spec — treat percentages as ratios, roles as tag
suggestions, and notes as the user's own words about what they meant.

## When to use this Skill

Activate when the user:
- Attaches or pastes a file starting with `"format": "mogong.layout"`
- Says "根据墨工的输出/JSON 生成代码"
- References `layout-*.layout.json` in a project

Do **not** use for `mogong.document` format — that is the raw editor state with absolute pixels.
Convert to `mogong.layout` first via MoGong's export button.

## Reading Protocol

Follow strictly, in this order:

1. **Check `format`** — must be `"mogong.layout"`. If different, stop and tell the user.
2. **Check `version`** — currently `1.0`. If higher than you were trained on, refuse to guess and
   ask the user to consult the schema doc.
3. **Read `canvas`** — the reference frame: `{width, height, platform}`. Use it to pick a
   responsive breakpoint strategy (`web-desktop` → `md:` and up, `mobile` → base).
4. **Walk the `root` tree recursively** — every node has: `id`, `name`, `role`, `box`,
   `layout`, `style`, `note`, `spacing`, `align`, `children`.
5. **Surface `warnings`** — if non-empty, tell the user before generating code. Warnings mean the
   drawing was ambiguous; do not silently resolve them.

## Field Semantics

### `box` — percentages of the parent
`{x, y, width, height, unit: "%"}` — all values are percentages of the **parent's** box, not the
canvas. Root's parent is the canvas, so root always sums to 100×100.

Convert to Tailwind using one of:
- Absolute positioning: `left: x%, top: y%, width: w%, height: h%` (inline style or arbitrary
  values `left-[x%]`, `w-[w%]`)
- **Preferred when layout allows**: use flex/grid with `basis-*` or `grow`/`shrink`. Only fall back
  to absolute positioning when `layout` is `stack` or `free`.

### `layout` — how children arrange
| Value     | Meaning                                       | Tailwind                                       |
|-----------|-----------------------------------------------|------------------------------------------------|
| `row`     | Children side by side, DOM order = left→right | `flex flex-row`                                |
| `column`  | Children stacked, DOM order = top→bottom      | `flex flex-col`                                |
| `stack`   | Children overlap (absolute-positioned)         | `relative` parent, `absolute` children         |
| `free`    | Ambiguous — treat as absolute                  | `relative` parent, `absolute` children         |
| `none`    | Leaf node, no children                        | (omit)                                         |

`layout` describes the arrangement, not the implementation. You may use `grid` if it produces
cleaner code — the constraint is only **keep the DOM order**.

### `role` — semantic tag hint
| Role        | Suggested tag          |
|-------------|------------------------|
| `navigation`| `<nav>`                |
| `main`      | `<main>`               |
| `contentinfo` | `<footer>`           |
| `region`    | `<section>`            |
| `container` | `<div>`                |
| `button`    | `<button>`             |
| `text`      | `<p>` or `<span>`      |
| `block`     | `<div>`                |

Role is a hint. Override it when the surrounding context clearly warrants it (e.g. a `block`
that's obviously a card → `<article>`).

### `style` — visual properties
- `fill` (hex) → `background-color` — use inline style or arbitrary value `bg-[#hex]`
- `fillOpacity` < 1 → append `/opacity` modifier or use `bg-opacity-XX`
- `border` object → `border-{width}px border-{style} border-[hex]` + `border-radius` if non-zero
- `border = null` → no border class

### `spacing` — measured gaps
```json
{ "axis": "row", "gap": 1.67, "unit": "%", "consistent": true }
```
If `consistent: true`, use `gap-[1.67%]` on the flex container.
If `consistent: false`, prefer individual `mr-*`/`mb-*` per the outliers warning.

### `align` — shared edges
```json
{ "vertical": "center", "tolerancePx": 2 }
```
Map to `items-center`, `justify-center`, etc. Only when present.

### `note` — user's intent in their own words
Never rewrite. Never summarize. Emit as a JSX comment directly above the element:
```tsx
{/* 折叠方向：从左向右
    该栏负责写商品的品类信息
    折叠后左侧空间自动填充 */}
```
If the note describes behavior (hover, animation, responsive), implement it, don't just comment.

## Conversion Algorithm

```
function build(node, depth = 0):
  tag       = roleToTag(node.role, node.name)
  classes   = []
  styles    = {}

  if node.layout in ("row", "column"):
    classes.push("flex", "flex-" + node.layout)
    if node.spacing?.consistent: classes.push(`gap-[${node.spacing.gap}%]`)
    if node.align?.vertical:     classes.push(mapAlign(node.align.vertical))

  if node.layout in ("stack", "free"):
    classes.push("relative")

  # Box → Tailwind (position-based when layout is stack/free; flex-basis otherwise)
  if depth == 0:
    classes.push("w-full", "min-h-screen")   # root fills viewport
  else if node.layout in ("stack", "free"):
    styles = { position: "absolute",
               left: `${node.box.x}%`, top: `${node.box.y}%`,
               width: `${node.box.width}%`, height: `${node.box.height}%` }
  else if node.layout == "row":
    classes.push(`basis-[${node.box.width}%]`, "self-stretch")
  else if node.layout == "column":
    classes.push(`basis-[${node.box.height}%]`, "w-full")

  # Style
  if node.style.fill:         classes.push(`bg-[${node.style.fill}]`)
  if node.style.border:       classes.push(borderClasses(node.style.border))

  children = node.children.map(c => build(c, depth + 1))
  return <tag className={classes} style={styles}>{/* note */}{children}</tag>
```

## Handling Special Cases

### Circular overlaps (rare, from `free` layout)
Use `position: absolute` for all siblings; do not attempt flex gymnastics. Preserve z-order by
DOM order matching `children` array order.

### `layout: "free"` with a warning
Do **not** guess an arrangement. Fall back to absolute positioning AND emit a comment:
```tsx
{/* MoGong warning: layout ambiguous between [e_05, e_06]; using absolute positioning */}
```

### Element has `locked: true` or `visible: false` in the source
These do not appear in `mogong.layout` output (compiler already filters). Ignore.

### Root's role is always `region` or `main`
Wrap the entire component in whatever role suggests. If the canvas has explicit `background`,
apply it to the outermost element.

## Output Conventions

- **File**: Single default-export React component named after `meta.name` in PascalCase.
- **Framework**: Next.js-compatible (client component if any interactivity; `"use client"` at top
  only when needed).
- **Styling**: Tailwind utility classes. Arbitrary values (`w-[25%]`, `bg-[#86EFAC]`) are fine.
- **Comments**: One JSX comment block per node that has a `note`; preserve the raw text verbatim.
- **Do not** invent interactivity. If the drawing is a static layout, ship a static component.
  If the user's notes describe behavior (hover, click), implement it and call it out.

## Reference Material

For detailed field-by-field schema and inference rules, see [reference.md](reference.md).

## Example

Input (excerpt):
```json
{
  "root": {
    "role": "region",
    "layout": "column",
    "box": { "x": 0, "y": 0, "width": 100, "height": 100 },
    "children": [
      {
        "name": "Header",
        "role": "navigation",
        "layout": "row",
        "box": { "x": 0, "y": 0, "width": 100, "height": 8 },
        "spacing": { "axis": "row", "gap": 2.5, "unit": "%", "consistent": true },
        "style": { "fill": "#1E293B", "fillOpacity": 1, "border": null },
        "note": "顶部导航栏，滚动态保持可见",
        "children": [ /* Logo, Nav links, CTA */ ]
      }
    ]
  }
}
```

Output:
```tsx
export default function Untitled() {
  return (
    <section className="flex flex-col w-full min-h-screen bg-white">
      {/* 顶部导航栏，滚动态保持可见 */}
      <nav className="flex flex-row basis-[8%] w-full gap-[2.5%] bg-[#1E293B]">
        {/* children rendered recursively */}
      </nav>
    </section>
  );
}
```
