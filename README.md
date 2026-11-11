# 墨工 (MoGong)

**视觉意图编译器** — 在画布上画出布局，编译为 AI Agent 可读取的结构化 JSON。

独立开发者在用 AI 编码助手构建前端时，后端逻辑往往能精确描述，但视觉布局只能用模糊的语言表达。" header 大概那么高，sidebar 占左侧一小部分"——Agent 理解不了这种描述。墨工把这段对话变成几何：你在画布上绘制矩形、标注备注、赋予颜色和嵌套关系，编译器将图形转换为 AI Agent 可以精确执行的 JSON 文件。

---

## 快速开始

### 环境要求

- Python 3.12+
- Node.js 20+ / npm 10+
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

### 一键启动（如果配置了 Makefile）

```bash
make dev
```

---

## 使用指南

### 绘制区域

| 操作 | 方法 |
|------|------|
| 绘制矩形 | 在画布空白处 **长按左键** 后拖拽 |
| 绘制图标 (Stamp) | 拖出的矩形小于 30×30 像素时自动成为圆形图标 |
| 选中区域 | **单击** 已绘制的矩形 |
| 移动区域 | 按住 **Option (Mac) / Alt (Win)** + 左键拖拽 |
| 调整大小 | 选中后拖拽四角控制点 |
| 从中心缩放 | 拖拽角点时按住 **Alt** 键 |
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
| `Escape` | 取消备注编辑 / 关闭右键菜单 |
| `方向键` | 平移画布（Shift 加速） |
| 滚轮 | 缩放画布（以鼠标为锚点） |
| 中键拖拽 | 平移画布 |

### 画布导航

- **缩放**：鼠标滚轮，或工具栏 `-` / `+` 按钮
- **重置缩放**：单击百分比数字（回到 100%）
- **自定义缩放**：双击百分比数字，输入 50–150 之间的值
- **平移**：鼠标中键拖拽，或方向键

### 外观编辑

选中矩形后，右侧面板可以编辑：

- **名称**：用于在 JSON 输出中标识区域
- **填充颜色**：色板选择或自定义 Hex 值，支持最近使用
- **边框样式**：实线 / 虚线
- **锁定**：防止误操作移动
- **隐藏**：不在画布上渲染（仍保留在文档中）

### 图层管理

- 右键点击矩形或侧边栏列表项，选择「置于顶层」/「置于底层」
- 画布渲染顺序 = 文档数组顺序

---

## 主题切换

工具栏右侧有一个 **🌙 / ☀** 按钮用于切换深色/浅色主题：

- 首次打开时跟随系统 `prefers-color-scheme` 设置
- 手动切换后偏好会保存到 localStorage
- 深色主题下画布背景、工具栏、面板、弹窗全部联动切换

---

## 导出与导入

### 导出 Layout JSON

1. 确保后端服务运行中（编译由后端执行）
2. 点击工具栏 **「导出」** 按钮
3. 浏览器自动下载 `{id}.layout.json` 文件
4. 可点击 **「复制」** 按钮将 JSON 复制到剪贴板

### 导入 JSON

点击工具栏 **「导入」** 按钮，选择 JSON 文件。支持两种格式：

| 格式 | `format` 字段 | 说明 |
|------|---------------|------|
| 文档格式 | `mogong.document` | 编辑器持久化的完整文档（绝对像素坐标） |
| 编译格式 | `mogong.layout` | 编译产物（百分比坐标），自动还原为像素 |

### 清除画布

点击 **「清除」** 按钮，**再次点击确认** 即可重置所有内容。
操作不可撤销，请谨慎。

---

## 喂给 AI Agent

将导出的 `*.layout.json` 粘贴到 Agent Prompt 前面，配合以下指令：

> 以下是一个可视化布局的编译输出，包含树状结构、百分比坐标、布局方向和语义角色。
> 请根据这个 JSON 生成对应的 React + Tailwind 代码：
> - `box` 字段用百分比定位
> - `layout` 决定 flex 方向（row / column / stack）
> - `role` 决定标签语义（nav / main / footer 等）
> - `note` 作为代码注释保留
> - `style.fill` 和 `style.border` 映射为 Tailwind 类

---

## 编译输出结构

```jsonc
{
  "format": "mogong.layout",
  "version": "1.0",
  "meta": { "name": "...", "source": "MoGong", "generatedAt": "..." },
  "canvas": { "width": 1440, "height": 900, "background": "#FFFFFF" },
  "root": {
    "id": "root",
    "children": [
      {
        "id": "el-abc",
        "name": "Header",
        "role": "navigation",      // 推断的语义角色
        "box": { "x": 0, "y": 0, "width": 100, "height": 8, "unit": "%" },
        "layout": "row",           // 推断的布局模式
        "style": { "fill": "#3B82F6", "border": null },
        "note": "固定导航栏",       // 用户备注原文
        "spacing": { "gap": 2, "unit": "%" },
        "children": []
      }
    ]
  },
  "warnings": [...]
}
```

编译器推断管线（7 个阶段）：
1. **嵌套树构建** — 按面积降序，找最小包含者为父节点
2. **布局模式推断** — row / column / stack / free
3. **角色推断** — navigation / contentinfo / main / region / container / button / text / block
4. **间距与对齐检测** — 测量兄弟间距，检测共享边缘
5. **相对坐标转换** — 绝对像素 → 相对父元素百分比
6. **组装 LayoutDocument** — 全字段合并
7. **完整性验证** — 确保无元素丢失

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
│   │   │   ├── layout/       # 工具栏、状态栏、外壳
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
├── docs/                     # 设计文档
├── fixtures/                 # 共享几何真值表
└── data/                     # 运行时数据（git-ignored）
```

---

## 开发

```bash
# 前端
cd frontend
npm run test            # 115 个测试
npm run build           # 生产构建
npm run lint            # ESLint
npm run typecheck       # TypeScript

# 后端
cd backend
source .venv/bin/activate
python -m pytest        # 153 个测试
ruff check .            # Lint
```

---

## 使用 Qoder Skill

项目自带一个 `.qoder/skills/mogong-layout/` Skill，用于把导出的 `*.layout.json` 直接交给 Agent。

**启用方式**：将本项目在 Qoder 中打开后，Skill 会自动加载；将 `layout.json` 拖到对话框，
或直接说“根据这份墨工输出代码”即可触发。

**Skill 内容**：
- `SKILL.md` —— 字段语义 / 转换算法 / Tailwind 映射约定 / 示例
- `reference.md` —— JSON Schema 逐字段参考 / Role 推断规则 / Layout 判断条件 / Warnings 处理策略

**跨 Agent 适配**：Skill 正文不依赖 Qoder 专有语法，可直接拷贝到 Cursor (`.cursor/rules/`)、
Claude Projects、Windsurf 等支持 Markdown Prompt 的环境。如需使用其他 Agent，把 `SKILL.md`
内容粘到他们的 System Prompt 或 Rules 文件中即可。

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

To be decided.
