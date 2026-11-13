# 墨工 (MoGong)

**视觉意图编译器** — 在画布上画出布局，编译为 AI Agent 可读取的结构化 JSON。

独立开发者在用 AI 编码助手构建前端时，后端逻辑往往能精确描述，但视觉布局只能用模糊的语言表达。" header 大概那么高，sidebar 占左侧一小部分"——Agent 理解不了这种描述。墨工把这段对话变成几何：你在画布上绘制矩形、标注备注、赋予颜色和嵌套关系，编译器将图形转换为 AI Agent 可以精确执行的 JSON 文件。

---

## 快速开始

### 环境要求

- Python 3.11+（后端 `requires-python` 下限，CI 跑 3.11）
- Node.js 20+ / npm 10+（CI 跑 24）
- macOS / Linux / Windows

### 启动后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e .[dev]
uvicorn app.main:app --port 8100 --reload
```

验证：`http://localhost:8100/api/health` 返回 `{"status": "ok"}`

### 启动前端

```bash
cd frontend
npm install
npm run dev
```

打开 `http://localhost:3000` 即编辑器界面。前端通过 Next.js rewrite 代理 `/api/*` 到后端 8100 端口。

### 一键启动

```bash
make dev      # 并行拉起后端 :8100 与前端 :3000
make smoke    # 起后端 → 探活 /api/health → 后端测试 → 前端测试 → 前端生产构建
make test     # 前后端测试
make lint     # 后端 ruff + 前端 typecheck / eslint
make help     # 列出全部目标
```

---

## 使用指南

### 绘制区域

| 操作 | 方法 |
|------|------|
| 绘制矩形 | 在**纸面范围内**按住左键直接拖拽，**无需长按**：越过 3 个屏幕像素就出虚线预览。按在已有矩形上同样画新矩形（嵌套子区域）；**纸面以外**按下的拖拽是平移视角，画不出区域 |
| 绘制图标 (Stamp) | 拖出的矩形 **宽和高都小于 32px** 时自动成为图章，渲染为固定直径的圆，备注显示为旁标签 |
| 选中区域 | **单击** 已绘制的矩形 |
| 移动区域 | 只有 **Option (Mac) / Alt (Win) + 左键拖拽** 这一种方式；普通拖拽现在一律绘制，不再移动任何东西 |
| 调整大小 | 选中后拖拽 **8 个控制点**（四角 + 四边中点） |
| 从中心缩放 | 拖拽控制点时按住 **Alt** 键 |
| 删除区域 | 选中后按 **Delete** 或 **Backspace** |
| 编辑备注 | **双击** 矩形，在浮动面板中输入 |

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z` 或 `Ctrl/Cmd + Y` | 重做 |
| `Ctrl/Cmd + C` | 复制选中元素 |
| `Ctrl/Cmd + V` | 在鼠标位置粘贴（以鼠标为中心） |
| `Delete` / `Backspace` | 删除选中元素 |
| `Escape` | 取消备注编辑 / 关闭右键菜单与帮助弹窗 / 中断当前拖拽 |
| `方向键` | 平移画布一挡（40px） |
| `Shift + 方向键` | 粗调平移（160px） |
| 滚轮 | 缩放画布（以鼠标为锚点） |
| 中键拖拽 | 平移画布 |
| 纸面外拖拽 | 平移画布（左键在图纸以外按下的拖拽） |

### 画布导航

- **缩放**：鼠标滚轮（以鼠标位置为锚点），或工具栏的缩小 / 放大按钮（到达 10%–800% 上下限时按钮自动禁用）
- **重置缩放**：单击百分比数字（回到 100%）
- **自定义缩放**：双击百分比数字，输入 50–150 之间的值
- **平移**：鼠标中键拖拽，或在纸面以外按住左键拖拽，或方向键
- **首次打开**：自动 `fitToView`，缩放并居中到能看全整张图纸

### 外观编辑

选中矩形后，右侧面板可以编辑：

- **名称**：会写进 JSON 的 `name`，也是 Agent 认组件的第一线索，值得起个人话名字（「商品品类侧栏」而不是「矩形 3」）
- **填充颜色**：8 色取色盘或自定义 Hex，最近使用的 8 色进 LRU（localStorage 键 `mogong-recent-colors`）
- **边框样式**：`实线（固定）` / `虚线（可折叠）` —— 这个语义会原样进 JSON，Agent 据此判断哪块能收起来
- **锁定**：防止误操作移动
- **隐藏**：不在画布上渲染，也不参与命中测试（仍保留在文档与编译产物中）

### 图层管理

- 右键点击矩形或侧边栏列表项，选择「置于顶层」/「置于底层」
- 画布渲染顺序 = 文档数组顺序
- 侧边栏列表项与画布共用同一套选中逻辑，双击列表项进入备注编辑

---

## 数字在哪里看

MoGong 是记录意图的草图工具，不是尺子。画布上不摆尺寸线、不摆百分比、不摆 gap 读数：
它们既不会让你把「这块大概占四分之一」表达得更清楚，又需要在拖拽的每一帧重算整棵父子链，
把画布拖慢。要确认尺寸有两个地方：

- **状态栏**（画布下沿）：光标坐标，以及选中元素的 `名称: 宽 × 高 at (x, y)`（像素）
- **编译产物**：导出后的 `*.layout.json`，那里的 `box` 才是编译器真正要交给 Agent 的百分比

画矩形时画布上唯一的反馈是那块虚线预览本身：它从第一个越过阈值的手指动作就跟住光标，所以
「我现在能不能画」不需要一个时长来回答——在纸面上拖就是画。

---

## 主题切换

工具栏右侧的线条图标按钮（太阳 / 月亮）切换深色与浅色：

- 首次打开时跟随系统 `prefers-color-scheme`
- 手动切换后偏好写入 localStorage（键 `mogong-theme`）
- 深浅两套只在 `<html>` 上切 `.dark` 类：组件里没有任何 `dark:` 变体，也没有 `slate-*` 与字面 hex，
  颜色一律是语义 token 类名。真正联动的是 `frontend/src/app/globals.css` 里的 token 块，家族为：
  工作台四档表面（桌面 / 面板 / 凹陷 / 浮起）、墨色四级、细线两级、一个强调蓝、一处朱砂印（只给
  wordmark）、危险红、液态玻璃三件（`tint` 半透明浮层 / `body` 近实底对话框 / `rim` 边框极性）与
  饱和度、画布上的选中与手柄控件、模态遮罩
- **不要**在组件或 store 里再写一遍色值：`use-theme-store` 曾用内联 CSS 变量覆盖一次，结果改 CSS
  完全不生效；后来又有两百多处组件直接写 `slate-*`，结果改 token 界面不动 —— 同一个毛病的两种形态，
  都是「第二套色源」
- 例外：画布上的颜色有两处**不跟随** token，因为它们是写进文档、编译进产物的**数据**而不是主题色：
  新建矩形的默认 `fill` / `border`（`svg-canvas.tsx`），与纸面本身的 `canvas.background`（默认
  `#FFFFFF`）。所以深色模式下桌面上依旧摊着一张白纸 —— 那是「灯下看图纸」，不是没改到位；真要改，
  改的是文档数据，会一路影响到导出产物
- 还有一条**跟随 token 但刻意不跟随主题**的：`--note-color` 在两个主题都是纯黑，因此 `.dark` 里没有它。
  备注的字压在色块自己的 `fill` 上，而色板是浅 pastel —— 浅墨落在上面的对比度只有 1.0–1.9，等于隐形；
  纯黑是唯一在这些块上读得通的墨（9–21，最差 `#64748B` 也有 4.41）。它属于「数据底色」而不是「主题」，
  判断依据是它压着的那块颜色，与深浅色无关

---

## 导出与导入

### 导出 Layout JSON

1. 确保后端服务运行中（编译由后端执行，前端不做第二套编译器）
2. 点击工具栏 **「导出」** 按钮（唯一的深色主行动按钮；画布为空时禁用）
3. 浏览器自动下载 `{meta.id}.layout.json`
4. 导出后旁边出现复制图标，可把同一份 JSON 直接送进剪贴板
5. 工具栏中间的状态槽会常驻显示结果（已导出 / 已复制 / 失败原因），不用盯着弹窗

### 导入 JSON

点击工具栏的导入图标（悬停提示「从 JSON 文件加载布局」），选择 JSON 文件。支持两种格式：

| 格式 | `format` 字段 | 说明 |
|------|---------------|------|
| 文档格式 | `mogong.document` | 编辑器持久化的完整文档（绝对像素坐标） |
| 编译格式 | `mogong.layout` | 编译产物（百分比坐标），自动还原为像素 |

### 清除画布

点击清除图标（悬停提示「清除所有内容」），按钮进入待确认态并显示 **「确认」**，**再点一次** 才真的清空；
3 秒内不点则自动解除。操作不可撤销（不进撤销栈），请谨慎。

---

## 喂给 AI Agent

导出的是**模具**，不是成品规格。

`*.layout.json` 约束的是区域之间的关系——谁包含谁、谁在谁之后、各占多少、之间留了多少空隙；
它不规定组件长什么样、用什么组件库、内部怎么拆分。那些由你的 prompt 和 Agent 的设计判断负责。

把 JSON 连同下面这段一起交给 Agent（在 Qoder 里打开本项目时，同样内容已内置为 `/mogong-layout`）：

> 你是一名优秀的前端设计师。我会给你一段 prompt 和一个 JSON 文件，仅根据这个 JSON 的约束，
> 输出一个网站，技术栈按我项目现状走。特别注意：**这份 JSON 是为了防止你随意创作前端布局
> 而设的约束条件，而非最终成品，你可以把它理解成模具。**
>
> - 每个节点先按 `role` / `name` / `note` **认出它是什么组件**，再实现组件；不要把矩形复刻成色块。
> - `note` 是需求原文，是要实现的功能（"2s 一张循环切换" 就要真的写这个定时器），不是代码注释。
> - 守住四条关系不变式：包含关系、`children` 顺序、`box` 比例（±2 个百分点内）、相邻与对齐。
> - `style.fill` 是编辑器里的区域身份色（8 色取色盘，用来区分相邻区域），不是品牌色，
>   不要把它映射成背景；配色、字体、间距系统、圆角按 prompt 与常识决定。
> - `layout` 是可以用于理解关系的线索，不是必须照抄的 CSS 指令。
> - `warnings` 是编译器承认自己没把握的地方，遇到时按语义选更合理的实现，而不是照抄歧义。
> - 栈按目标项目现状落地（React / Vue / 原生均可），适配文件只示范判断过程，不是可搬的语言。
> - 交付前自检：树里每个节点是否都变成了像样的组件？有没有留下 20 行以上的绝对定位色块？

反面清单——把这四个字段直接映射成 CSS，产出的就是一堆带百分比的灰色矩形：
`box` → 绝对定位、`layout` → flex 方向、`note` → 注释、`style.fill` → 背景色。

---

## 编译输出结构

摘自仓库里的真实产物 `data/compiled/layout-mwbqxrvp.layout.json`（字段名按 camelCase 序列化）：

```jsonc
{
  "format": "mogong.layout",
  "version": "1.0",
  "meta": { "name": "untitled", "source": "MoGong", "generatedAt": "2026-11-11T10:42:35.044419+00:00" },
  "canvas": { "width": 1440.0, "height": 900.0, "background": "#FFFFFF", "platform": "web-desktop" },
  "root": {
    "id": "root",
    "name": "Page",
    "role": "region",            // root 固定为 region
    "box": { "x": 0.0, "y": 0.0, "width": 100.0, "height": 100.0, "unit": "%" },
    "layout": "free",
    "style": { "fill": "#FFFFFF", "fillOpacity": 1.0, "border": null },
    "note": null,
    "spacing": null,
    "align": null,
    "children": [
      {
        "id": "el-mwbr04bh",
        "name": "商品品类 （侧栏）",
        "role": "block",
        "box": { "x": 72.57, "y": 2.24, "width": 25.0, "height": 94.78, "unit": "%" },
        "layout": "none",
        "style": {
          "fill": "#86EFAC",     // 编辑器取色盘里的区域身份色，不是品牌色
          "fillOpacity": 1.0,
          "border": { "width": 1.0, "style": "dashed", "color": "#64748B", "radius": 0.0 }
        },
        "note": "折叠方向：从左向右\n该栏负责写商品的品类信息\n折叠后左侧空间自动填充",
        "spacing": null,
        "align": null,
        "children": []
      }
    ]
  },
  "warnings": []
}
```

`box` 永远是**相对直接父元素**的百分比（root 相对画布），不是相对视口、也不是像素。
`spacing` 出现时形如 `{ "axis": "row", "gap": 2.5, "unit": "%", "consistent": true }`；
`border` 缺省是 `null` 而不是 0 宽度，Agent 读到 `null` 就是真的没有边框。

编译器推断管线（7 个阶段）：
1. **嵌套树构建** — 找最小包含者为父节点，因此容器嵌套与绘制顺序无关
2. **布局模式推断** — `none` / `row` / `column` / `stack` / `free`
3. **角色推断** — `navigation` / `contentinfo` / `main` / `region` / `container` / `button` /
   `text` / `block`（`image` 在枚举里但暂无规则会输出，当预留值看）
4. **间距与对齐检测** — 测量兄弟间距，检测共享边缘
5. **相对坐标转换** — 绝对像素 → 相对父元素百分比，保留 2 位小数（前后端同一常量）
6. **组装 LayoutDocument** — 全字段合并
7. **完整性验证** — 确保无元素丢失；歧义写进 `warnings`，不静默猜

`warnings` 的代码：`PARTIAL_OVERLAP`、`AMBIGUOUS_LAYOUT`、`INCONSISTENT_GAP`、`OFF_CANVAS`、
`EMPTY_DOCUMENT`、`ELEMENT_DROPPED`。它们是编译器说「这里我没把握」的机制。

---

## 技术栈

| 层 | 选型 |
|----|------|
| 前端 | Next.js 16 + React 19 + Zustand + Tailwind CSS 4 + SVG |
| 后端 | Python 3.12 + FastAPI + Pydantic v2 |
| 测试 | Vitest (前端) + pytest (后端) |
| 编译器 | 纯函数管线，无副作用 |

---

## 项目结构

```
mo-gong/
├── frontend/
│   ├── src/
│   │   ├── app/              # Next.js App Router
│   │   ├── components/
│   │   │   ├── canvas/       # SVG 画布、矩形、备注编辑器、右键菜单
│   │   │   ├── layout/       # 工具栏、状态栏、外壳、帮助弹窗
│   │   │   └── panel/        # 侧边栏、外观面板、颜色选择器
│   │   ├── hooks/            # 键盘快捷键、剪贴板、历史记录
│   │   ├── lib/              # 几何计算、手势仲裁、导出/导入
│   │   ├── stores/           # Zustand: 文档、视图、交互、主题、历史
│   │   └── types/            # 文档 & Layout 类型定义
│   └── tests/
├── backend/
│   ├── app/
│   │   ├── routers/          # API 端点：compile, validate, layouts
│   │   ├── schemas/          # Pydantic 模型：document, layout
│   │   └── services/
│   │       ├── infer/        # 推断模块：layout_mode, roles, spacing, relative
│   │       ├── compiler.py   # 编译管线组装
│   │       ├── nesting.py    # 嵌套树构建
│   │       ├── storage.py    # 文件存储
│   │       └── validate.py   # 完整性检查
│   └── tests/
├── .qoder/skills/
│   └── mogong-layout/        # 把编译产物交给 Agent 的 Skill（规则 + 字段参考 + 三份栈适配）
├── docs/                     # spec / architecture / json-schema / dev-guide / diagrams
├── fixtures/cases/           # 前后端共享的几何真值表
├── scripts/                  # dev.sh / smoke_test.sh / 真值表生成
└── data/                     # 编译产物与文档存档（注意：当前受 git 跟踪，并未忽略）
```

---

## 开发

```bash
# 前端
cd frontend
npm run test            # vitest
npm run build           # 生产构建
npm run lint            # ESLint
npm run typecheck       # TypeScript

# 后端
cd backend
source .venv/bin/activate
python -m pytest        # 后端单测与 e2e
ruff check .            # Lint
```

---

## 使用 Qoder Skill

上一节的契约已经固化成项目自带的 `.qoder/skills/mogong-layout/`，Agent 会自动发现它。

**启用方式**：在 Qoder 中打开本项目，把 `*.layout.json` 拖进对话框，或输入 `/mogong-layout`
显式调用，也可以直接说「按这份墨工输出做前端」。

**内容分工**：
- `SKILL.md` —— 角色与契约 / 失败模式（矩形复刻长什么样）/ 双输入分工 / 读盘协议 / 组件识别表 /
  四条关系不变式 / `style` 与 `note` 的正确用法 / warnings 应对 / 内容从哪来 / 交付约定 / 栈适配 / 自检
- `reference.md` —— JSON 逐字段参考、Role 与 Layout 的推断条件、Warning 码、版本兼容
- `react.md` / `vue.md` / `vanilla.md` —— 同一意图在三种栈里的写法对照、完整示例、该栈专属失败信号

Skill 只提供判断依据，不写死代码模板：**它不给 Tailwind 类映射表**，因为一旦给出映射，
Agent 就会退化成逐格转录。同理它也不把规则层钉在某个框架上 —— 钉死之后，Agent 会把示例的语言
当成规范。仓库里的 `data/compiled/*.layout.json` 是真实样本，供 Skill 举例。

**栈适配（与框架无关）**：模具与规则层不绑定框架。JSON 里没有任何框架信息，`layout: "row"` 在 React、Vue、
原生 HTML 里是同一个意思。栈由目标项目的 `package.json` 判定，判定顺序写在 `SKILL.md` 的「栈适配」
一节；三份适配文件各自把同一份 `layout-mwbqxrvp.layout.json` 做成该栈的完整产物，把 React 示例的
写法搬进 Vue 项目是适配文件里点名的头号失败信号。

**宿主 Agent 适配**：正文不依赖 Qoder 专有语法，可整份粘进 Cursor（`.cursor/rules/`）、Claude Projects、
Windsurf 等支持 Markdown 规则的环境。

---

## 里程碑状态

| 里程碑 | 内容 | 状态 |
|--------|------|------|
| M0 | 项目脚手架、架构文档 | ✅ |
| M1 | 后端 schema、存储、验证 | ✅ |
| M2 | 画布绘制、选中、移动、缩放、删除、撤销 | ✅ |
| M3 | 备注、颜色、边框、图标 Stamp、图层 | ✅ |
| M4 | 编译器管线 + 前端导出/导入 + 主题切换 | ✅ |
| M5 | Qoder Skill 封装 / Agent 集成 | ✅ |

---

## License

[MIT](LICENSE) © 2026 Linson1129
