# 无框架栈适配（静态 HTML + CSS + 少量 JS）

只写「同一意图在原生栈里长什么样」。规则、关系不变式、识别表、note 与 style 的读法都在
[SKILL.md](SKILL.md)，字段含义在 [reference.md](reference.md)。本文件与 SKILL.md 冲突时以 SKILL.md 为准。

## 何时读这一份

- 目标位置没有 `package.json`，用户要的就是一个能直接双击打开的静态页；
- 目标项目是 Jekyll / Hugo / PHP 模板 / 邮件页这类没有组件运行时的场景；
- 目标栈是 Svelte、Astro、Solid 这类本目录没有专门适配文件的框架 —— 规则全部照用，把本文件的
  「意图到写法」当映射起点，按该栈自己的惯用法落地，**不要**反过来套 React 或 Vue 的写法。

## 意图到写法的对应

| 意图清单里的判断 | 原生落地 |
|---|---|
| 区块划分 | 语义标签直接落：`header` / `nav` / `main` / `aside` / `section` / `footer`，一个模具节点一个语义元素 |
| 区域在右侧但 DOM 里排在后面 | 保持 `children` 顺序写 DOM，视觉位置交给 `grid-template-areas` 或 `order` —— 不变式 2 守 DOM 顺序，不守坐标 |
| 比例（模具的 `box`） | `grid-template-columns: 3fr 1fr` 这类分数表达；分数网格外的值用 `width: 25%` 写在 CSS 里，不写内联 `style` |
| 间距（`spacing.gap`） | `gap` 属性（flex 与 grid 都支持），不要逐块 `margin` |
| 对齐（`align`） | `align-items` / `justify-items` / `place-*`，按父容器的 `layout` 选轴 |
| 折叠侧栏 | 按钮 `aria-expanded` + 给容器切一个 `.rail--collapsed` 类 + CSS `transition: width`；状态存在容器上，不藏在按钮里 |
| 自动轮播 | `setInterval` 改当前索引 + `transform: translateX()`；`prefers-reduced-motion` 时默认不自动播 |
| 同族重复项 | 数据写成 JS 数组，用 `<template>` + `cloneNode` 或一次性字符串拼接渲染；条目名来自 note |
| 导航条目 | `<a href>`，当前项 `aria-current="page"` |
| 按钮 | `<button type="button">` + `:hover` / `:focus-visible` / `:active` |
| 保持可见的顶栏 | `position: sticky; top: 0` |
| `fillOpacity < 1` | `background-color: rgb(2 6 23 / 40%)` 或 `color-mix()`，不是给元素整体调 `opacity` |
| 设计 token | `:root { --surface-1: ...; --ink-1: ...; --gap-1: ... }`，全站只有这一处色源 |
| 溯源注释 | HTML 用 `<!-- el-mwbr04bh · 折叠方向：从左向右 -->`，CSS/JS 用 `/* el-ad · 2s 一张 */` |

## 目录约定

```
index.html
styles/tokens.css     颜色、字阶、间距基线、圆角、阴影，只有这里定义色值
styles/layout.css     网格、比例、对齐、折叠与轮播的视觉表现
scripts/carousel.js   定时器与索引
scripts/rail.js       折叠状态切换
scripts/main.js       入口，type="module" 引入上面两个
data/catalog.js       品类、法务条目等数组（内容来自 note 与 prompt）
```

超过两屏内容再考虑拆页面；不要为了「像框架」引入打包器。

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

失败输出（复刻矩形，原生版长相）：

```html
<aside style="position:absolute; left:72.57%; width:25%; height:94.78%;
              background:#86EFAC; border:1px dashed #64748B;">
  <!-- 折叠方向：从左向右 -->
</aside>
```

三处同时踩雷：源文件色号进产物、虚线描边进产物、note 降级成注释且没有折叠行为。
原生栈还多一条专属失败：把草图坐标整组写进内联 `style`，等于用绝对定位复刻画布。

正确输出（认出组件 + 实现 note）：

`index.html`（骨架，DOM 顺序 = `children` 顺序）

```html
<body>
  <div class="page">
    <header class="masthead">
      <a class="brand" href="/">墨工</a>
      <!-- 品类入口 · note：上面可以跳转、3C数码、服装、食品三大类 -->
      <nav class="entry" aria-label="品类入口">
        <a href="/3c">3C数码</a><a href="/apparel">服装</a><a href="/food">食品</a>
      </nav>
    </header>

    <main class="content">
      <!-- el-ad · 滑动广告栏，自动广告，2s一张，循环切换 -->
      <section class="promo" id="promo" aria-roledescription="轮播">
        <div class="promo__track" id="promo-track"></div>
        <div class="promo__dots" id="promo-dots"></div>
      </section>

      <section class="legal">
        <h2>法律相关</h2>
        <ul id="legal-list"></ul>
      </section>
    </main>

    <!-- el-mwbr04bh · 折叠方向：从左向右 · 折叠后左侧空间自动填充 -->
    <aside class="rail" id="rail" aria-label="商品品类">
      <button type="button" id="rail-toggle" aria-expanded="true" aria-controls="rail">
        收起品类栏
      </button>
      <nav class="rail__list" id="rail-list"></nav>
    </aside>
  </div>

  <footer class="sitefoot">
    <p>© 2026 墨工</p>
    <nav aria-label="法务"><a href="/terms">服务条款</a><a href="/license">网络许可</a></nav>
  </footer>

  <script type="module" src="scripts/main.js"></script>
</body>
```

`styles/layout.css`（比例与折叠补位）

```css
/* 侧栏在视觉上位于右侧，但 DOM 顺序保持模具的 children 顺序 */
.page {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 25%;   /* el-mwbr04bh 的 width 25% */
  grid-template-areas:
    "masthead masthead"
    "content  rail"
    "sitefoot  sitefoot";
  gap: var(--gap-page);
}
.rail { grid-area: rail; width: auto; transition: width 300ms ease; }
.rail--collapsed { grid-template-columns: minmax(0, 1fr) 3rem; } /* 折叠后主区自动补位 */
.promo { flex-basis: 32.5%; }                  /* el-ad 的 height 32.5% 对应主轴占比 */
```

`scripts/rail.js`（note 的折叠行为）

```js
/* el-mwbr04bh · 折叠方向：从左向右 */
const page = document.querySelector(".page");
const rail = document.getElementById("rail");
const toggle = document.getElementById("rail-toggle");

toggle.addEventListener("click", () => {
  const collapsed = rail.getAttribute("aria-expanded") === "true";
  rail.setAttribute("aria-expanded", String(!collapsed));
  page.classList.toggle("rail--collapsed", collapsed);
  toggle.textContent = collapsed ? "展开品类栏" : "收起品类栏";
});
```

`scripts/carousel.js`（note 的 2s 一张与循环）

```js
/* el-ad · 自动广告，2s一张，循环切换 */
import { SLIDES } from "../data/slides.js";

const track = document.getElementById("promo-track");
const dots = document.getElementById("promo-dots");
let index = 0;
let timer;

const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

function render() {
  track.style.transform = `translateX(-${index * 100}%)`;
  dots.querySelectorAll("button").forEach((d, i) => d.setAttribute("aria-current", String(i === index)));
}

if (SLIDES.length > 1 && !reduced) {
  timer = setInterval(() => { index = (index + 1) % SLIDES.length; render(); }, 2000);
}

document.getElementById("promo").addEventListener("mouseenter", () => clearInterval(timer));
document.getElementById("promo").addEventListener("mouseleave", () => {
  if (!reduced && SLIDES.length > 1) timer = setInterval(() => { index = (index + 1) % SLIDES.length; render(); }, 2000);
});
```

`layout: "free"` 在这里的处理：从 `name` + `note` 认出「侧栏 + 主区 + 广告 + 页脚」是电商首页的
层叠关系，用 `grid-template-areas` 实现；而不是把四个块 `position: absolute` 钉在草图坐标上。

## 本栈专属失败信号

出现任意一条就重写：

- 内联 `style` 里出现 `#86EFAC` / `#64748B` / `#E2E8F0`，或 `border: 1px dashed`
- 区块用 `position: absolute` + 草图坐标定位，而不是 grid / flex
- 有折叠按钮但没有 `aria-expanded` / `aria-controls`，或有轮播但完全无 JS（等于没实现 note）
- `setInterval` 没考虑 `prefers-reduced-motion`，也没在鼠标进入时暂停
- 色值散落在多个 CSS 文件里 —— 原生栈同样只允许 `tokens.css` 一处色源
- 为了「像框架」引入 React / Vue 运行时或打包器
