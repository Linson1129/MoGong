# React 栈适配（React 18/19 + Next.js / Vite React）

只写「同一意图在 React 里长什么样」。规则、关系不变式、识别表、note 与 style 的读法都在
[SKILL.md](SKILL.md)，字段含义在 [reference.md](reference.md)。本文件与 SKILL.md 冲突时以 SKILL.md 为准。

## 何时读这一份

目标项目 `package.json` 的 dependencies 里有 `react`。App Router 与 `vite + react` 都走这份；
差异只在 `"use client"` 这条规则上（Vite React 没有 RSC，整棵树都是客户端）。

## 意图到写法的对应

| 意图清单里的判断 | React 落地 |
|---|---|
| 有交互的组件（折叠、轮播、当前项） | `"use client"` + `useState`；定时器写在 `useEffect` 里并返回清理函数 |
| 无交互的区块（页脚、品牌位） | Server Component，不加 `"use client"` —— 加了就把整棵子树推下客户端 |
| 折叠后兄弟自动补位 | flex 兄弟 + 宽度类切换（`cn()` 合并），不要手动算剩余宽度 |
| 同族重复项 | 数组 `.map()` + 稳定 `key`，数据抽到 `data/*.ts` 并给类型 |
| 文案与条目可替换 | typed props interface（如 `items: NavItem[]`）；几何比例不进 props |
| 导航条目 | 项目已有路由就用 `next/link` / `react-router` 的 `Link`，否则 `<a href>` |
| 按钮 | 真 `<button type="button">` + `hover` / `focus-visible` / `active` 三态 |
| 保持可见的顶栏 | `sticky top-0 z-*`，不要 `fixed` 再补占位高度 |
| 比例（模具的 `box`） | 优先 `w-1/4` 这类语义分数，比例不在分数网格上才用 `w-[25%]` / `basis-[82%]` |
| `fillOpacity < 1` | Tailwind 4 写斜杠：`bg-slate-500/40`；`bg-opacity-*` 已废弃，别输出 |
| 溯源注释 | `{/* el-mwbr04bh · 折叠方向：从左向右 */}`，JSX 文本区里不能写 `//` |

## 目录与命名

- 组件按意图清单拆，`components/*.tsx`；数据与文案 `data/*.ts`；类型 `types/*.ts`。
- 组件名用清单里的「判定它是什么组件」，不用 JSON 的 `id`：`CategoryRail`、`PromoCarousel`，
  而不是 `ElMwbr04bh`。
- 跟随目标项目已有的目录约定；已有 `src/app` 就不要另起 `pages`。

## 完整示例（输入取自 `data/compiled/layout-mwbqxrvp.layout.json`）

输入（节选）：

```json
{
  "root": {
    "layout": "free",
    "children": [
      {
        "id": "el-mwbr04bh",
        "name": "商品品类 （侧栏）",
        "role": "block",
        "box": { "x": 72.57, "y": 2.24, "width": 25.0, "height": 94.78 },
        "style": { "fill": "#86EFAC", "border": { "style": "dashed", "color": "#64748B" } },
        "note": "折叠方向：从左向右\n该栏负责写商品的品类信息\n折叠后左侧空间自动填充"
      },
      {
        "id": "el-ad",
        "name": "Banner",
        "role": "block",
        "box": { "width": 46.0, "height": 32.5 },
        "note": "滑动广告栏，自动广告，2s一张，循环切换"
      },
      { "name": "品类入口", "role": "text", "note": "信息栏， 上面可以跳转、3C数码、服装、食品三大类" },
      { "name": "Logo", "role": "block", "note": "Logo" },
      { "name": "Footer", "role": "contentinfo", "note": "法律相关、法条、网络许可、审批内容" }
    ]
  }
}
```

失败输出（复刻矩形，React 版长相）：

```tsx
<div className="relative">
  <aside style={{ left: "72.57%", width: "25%", height: "94.78%" }}
         className="absolute bg-[#86EFAC] border border-dashed border-[#64748B]">
    {/* 折叠方向：从左向右 ... */}
  </aside>
</div>
```

三处同时踩雷：源文件色号进产物、虚线描边进产物、note 降级成注释且没有折叠行为。

正确输出（认出组件 + 实现 note）：

```tsx
"use client";

const CATEGORIES = [
  { label: "3C数码", href: "/3c" },
  { label: "服装", href: "/apparel" },
  { label: "食品", href: "/food" },
];

/* el-mwbr04bh · 折叠方向：从左向右 · 折叠后左侧空间自动填充 */
export function CategoryRail({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      aria-expanded={!collapsed}
      className={cn(
        "shrink-0 transition-[width] duration-300", // 「折叠后左侧空间自动填充」= flex 兄弟自动补位
        collapsed ? "w-12" : "w-1/4",               // 比例对齐模具的 width 25%
      )}
    >
      <button type="button" onClick={onToggle} className="focus-visible:ring-2 …" aria-label="折叠品类栏">
        {collapsed ? "»" : "«"}
      </button>
      <nav aria-label="商品品类">
        {CATEGORIES.map((c) => (
          <Link key={c.href} href={c.href} className="block rounded-md px-3 py-2 hover:bg-slate-100">
            {/* 条目名直接取自 note */}
            {c.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

/* el-ad · 「滑动广告栏，自动广告，2s一张，循环切换」 */
export function PromoCarousel({ slides }: { slides: Slide[] }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || slides.length < 2) return;
    const t = setInterval(() => setI((p) => (p + 1) % slides.length), 2000); // note: 2s 一张
    return () => clearInterval(t);
  }, [paused, slides.length]);
  return (
    <section
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative basis-[32.5%]"
    >
      …
    </section>
  );
}
```

`layout: "free"` 在这里的处理：从 `name` + `note` 认出「侧栏 + 主区 + 广告 + 页脚」是电商首页的
层叠关系，用 flex 布局实现，而不是把四个块 `position: absolute` 钉在草图坐标上。

## 本栈专属失败信号

出现任意一条就重写，不用等自检：

- `bg-[#E2E8F0]` / `bg-[#86EFAC]` / `border-dashed` / `border-[#64748B]`
- `useState` 只用来存一个没人读的序号，或 `useEffect` 里起了定时器没返回清理函数
- 纯展示区块顶上挂了 `"use client"`
- `.map()` 的 `key` 用了数组下标以外的可变值，或者干脆手写重复 DOM 不抽数据
- 静态比例写死成 `style={{ width: "25%" }}` 而 Tailwind 网格类本可表达
- `tsc --strict` 不过（Next.js 16 的路由类型要先跑一次 `next typegen`，再单独跑 `tsc`）
