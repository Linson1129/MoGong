# Vue 栈适配（Vue 3 + Vite，SFC / `<script setup>`）

只写「同一意图在 Vue 里长什么样」。规则、关系不变式、识别表、note 与 style 的读法都在
[SKILL.md](SKILL.md)，字段含义在 [reference.md](reference.md)。本文件与 SKILL.md 冲突时以 SKILL.md 为准。

## 何时读这一份

目标项目 `package.json` 的 dependencies 里有 `vue`。默认按 Vue 3 + Vite + 单文件组件写；
只有 Options API 遗留项目（`export default { data() {} }`）才跟随现状，别把 Composition API
硬塞进旧写法。

## 意图到写法的对应

| 意图清单里的判断 | Vue 落地 |
|---|---|
| 有交互的组件（折叠、轮播、当前项） | `<script setup lang="ts">` + `ref` / `computed`；定时器在 `onMounted` 起、`onBeforeUnmount` 清 |
| 无交互的区块（页脚、品牌位） | 纯模板 + 静态 class，不需要任何响应式 API —— Vue 没有 RSC 边界，别造 `"use client"` 之类的标记 |
| 折叠状态在多个组件间共享 | 状态提到共同父组件，`props` 下发 + `emit` 上报；跨很多层才用 `provide` / `inject` |
| 折叠后兄弟自动补位 | flex 兄弟 + `:class` 切宽度，不要手动算剩余宽度 |
| 同族重复项 | `v-for` + `:key`（用稳定 id，不用 index），数据放 `src/data/*.ts` 并导出类型 |
| 文案与条目可替换 | `defineProps<{ items: NavItem[] }>()`（Vue 3.3+ 泛型写法）；几何比例不进 props |
| 导航条目 | 项目装了路由就用 `<RouterLink :to>`，否则 `<a :href>` |
| 按钮 | 真 `<button type="button">` + `hover` / `focus-visible` / `active` 三态 |
| 条件显隐的内容 | `v-if`（要保留状态用 `v-show`），进出动画包 `<Transition>` |
| 保持可见的顶栏 | `sticky top-0 z-*`，不要 `fixed` 再补占位高度 |
| 比例（模具的 `box`） | 优先 `w-1/4` 这类语义分数；不在分数网格上才 `w-[25%]` / `basis-[82%]` |
| `fillOpacity < 1` | Tailwind 4 写斜杠 `bg-slate-500/40`；`bg-opacity-*` 已废弃 |
| 溯源注释 | 模板里 `<!-- el-mwbr04bh · 折叠方向：从左向右 -->`，脚本里 `// el-mwbr04bh · ...` |

## 目录与命名

- 组件 `src/components/*.vue`，文件名 PascalCase：`CategoryRail.vue`、`PromoCarousel.vue`，
  不要 `ElMwbr04bh.vue`。
- 数据与文案 `src/data/*.ts`；共享类型 `src/types/*.ts`；可复用逻辑抽 `src/composables/useXxx.ts`。
- 一个模具节点对应一个组件文件；只有「判定它是什么组件」列里确实是独立组件时才拆。
- 跟随目标项目已有目录；已有 `src/views` 就不要另起 `src/pages`。

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

失败输出（复刻矩形，Vue 版长相）：

```vue
<template>
  <aside
    class="absolute border border-dashed"
    :style="{ left: '72.57%', width: '25%', height: '94.78%', background: '#86EFAC', borderColor: '#64748B' }"
  >
    <!-- 折叠方向：从左向右 -->
  </aside>
</template>
```

三处同时踩雷：源文件色号进产物、虚线描边进产物、note 降级成注释且没有折叠行为。
另一种更常见的 Vue 专属失败：把 React 适配文件里的 `.tsx` 写法整份搬过来 —— 见文末失败信号。

正确输出（认出组件 + 实现 note）：

`src/components/CategoryRail.vue`

```vue
<script setup lang="ts">
import { CATEGORIES } from "../data/catalog";

// el-mwbr04bh · 折叠方向：从左向右 · 折叠后左侧空间自动填充
defineProps<{ collapsed: boolean }>();
defineEmits<{ toggle: [] }>();
</script>

<template>
  <aside
    :aria-expanded="!collapsed"
    class="shrink-0 transition-[width] duration-300"
    :class="collapsed ? 'w-12' : 'w-1/4'"
  >
    <button type="button" class="…" aria-label="折叠品类栏" @click="$emit('toggle')">
      {{ collapsed ? "»" : "«" }}
    </button>
    <nav aria-label="商品品类">
      <!-- 条目名直接取自 note：3C数码 / 服装 / 食品 -->
      <RouterLink
        v-for="c in CATEGORIES"
        :key="c.href"
        :to="c.href"
        class="block rounded-md px-3 py-2 hover:bg-slate-100"
      >
        {{ c.label }}
      </RouterLink>
    </nav>
  </aside>
</template>
```

`src/components/PromoCarousel.vue`

```vue
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { Slide } from "../types/slide";

// el-ad · 「滑动广告栏，自动广告，2s一张，循环切换」
const props = defineProps<{ slides: Slide[] }>();

const index = ref(0);
const paused = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  if (props.slides.length < 2) return;
  timer = setInterval(() => {
    if (paused.value) return; // hover 暂停：note 没说要就不写这条分支
    index.value = (index.value + 1) % props.slides.length;
  }, 2000); // note: 2s 一张
});

onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <section
    aria-roledescription="carousel"
    class="relative basis-[32.5%]"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
  >
    <!-- 幻灯片轨道、指示点、当前项 aria-current -->
  </section>
</template>
```

父组件里折叠状态的归属：`collapsed` 放在同时包含侧栏与主区的那个容器上，两边通过 props 与
emit 联动 —— 这正是「折叠后左侧空间自动填充」的实现方式（flex 兄弟补位），不需要算剩余宽度。

`layout: "free"` 在这里的处理：从 `name` + `note` 认出「侧栏 + 主区 + 广告 + 页脚」是电商首页的
层叠关系，用 flex 布局实现，而不是把四个块 `position: absolute` 钉在草图坐标上。

## 样式与类型检查

- Tailwind 4 在 Vite 下走 `@tailwindcss/vite` 插件，CSS 入口 `@import "tailwindcss";`；
  项目里没有 Tailwind 就用原生 CSS 变量做 token，不要为了这份产物临时装 Tailwind。
- 类型检查命令是 `vue-tsc --noEmit`（不是 `tsc`）；SFC 里的模板表达式也归它管。

## 本栈专属失败信号

出现任意一条就重写：

- `.tsx` 文件、`useState` / `useEffect`、`className=`、`import React`、`.map()` 出现在模板里 ——
  这是把 React 适配文件的语言搬进了 Vue 项目，属于最严重的失败，整份退回
- `background: '#86EFAC'`、`borderColor: '#64748B'`、`border-dashed` 出现在 `:style` 或 class 里
- `v-for` 没有 `:key`，或 `:key` 用 index 且列表会变
- `setInterval` 在 `onMounted` 起了但 `onBeforeUnmount` 没清，或反过来在 `setup` 顶层直接起
- 折叠状态在子组件里自己存一份，导致「折叠后左侧空间自动填充」实现不了
- 静态比例写成 `:style="{ width: '25%' }"`，而 Tailwind 或普通 CSS 类本可表达
- 为了「像 React」引入 JSX 插件（`@vitejs/plugin-vue-jsx`），而项目原本没有它 —— 栈由目标项目决定，
  不由示例决定
