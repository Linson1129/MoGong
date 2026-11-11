/**
 * 使用教程弹窗：点击工具栏「?」按钮后展示的操作速查手册。
 *
 * 内容以 Tab 分组：绘制操作 / 快捷键 / 导出与 Agent 对接。
 * 面板采用 overlay + 居中卡片模式，点击遮罩或按 Escape 关闭。
 */

import { useCallback, useEffect, useState } from "react";

type Tab = "draw" | "keys" | "export";

const TABS: { id: Tab; label: string }[] = [
  { id: "draw", label: "绘制操作" },
  { id: "keys", label: "快捷键" },
  { id: "export", label: "导出 & Agent" },
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("draw");

  // Escape 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="墨工使用教程"
    >
      <div className="relative w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
            墨工使用教程
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 border-b border-slate-200 px-5 pt-2 dark:border-slate-700">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-t px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.id
                  ? "border border-b-white bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
          {tab === "draw" && <DrawContent />}
          {tab === "keys" && <KeysContent />}
          {tab === "export" && <ExportContent />}
        </div>

        {/* 底部 */}
        <div className="border-t border-slate-200 px-5 py-2.5 text-right dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-slate-100 px-3 py-1 text-xs text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            知道了
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 内容
// ---------------------------------------------------------------------------

function DrawContent() {
  return (
    <div className="space-y-3">
      <Section title="绘制区域">
        <Row action="长按左键拖拽" desc="在画布空白处绘制矩形" />
        <Row action="拖出 < 30×30" desc="自动成为圆形图标 (Stamp)" />
        <Row action="单击矩形" desc="选中该区域" />
        <Row action="Option/Alt + 左键拖拽" desc="直接移动选中元素" />
        <Row action="拖拽角点" desc="调整大小" />
        <Row action="Alt + 拖角点" desc="从中心对称缩放" />
        <Row action="双击矩形" desc="打开备注编辑器" />
        <Row action="右键矩形" desc="打开上下文菜单（置顶/置底/删除）" />
      </Section>

      <Section title="画布导航">
        <Row action="滚轮" desc="以鼠标为锚点缩放" />
        <Row action="中键拖拽" desc="平移画布" />
        <Row action="方向键" desc="平移画布（Shift 加速 3×）" />
        <Row action="单击百分比" desc="重置缩放为 100%" />
        <Row action="双击百分比" desc="输入自定义缩放值 (50-150%)" />
      </Section>

      <Section title="外观编辑">
        <p className="text-slate-500 dark:text-slate-400">
          选中区域后，右侧面板可编辑名称、填充色、边框样式（实线/虚线）、锁定和隐藏状态。
        </p>
      </Section>
    </div>
  );
}

function KeysContent() {
  return (
    <div className="space-y-3">
      <Section title="编辑操作">
        <Row action="⌘/Ctrl + Z" desc="撤销" />
        <Row action="⌘/Ctrl + Shift + Z" desc="重做" />
        <Row action="⌘/Ctrl + Y" desc="重做（备选）" />
        <Row action="⌘/Ctrl + C" desc="复制选中元素" />
        <Row action="⌘/Ctrl + V" desc="在鼠标位置粘贴（以鼠标为中心）" />
        <Row action="Delete / Backspace" desc="删除选中元素" />
      </Section>

      <Section title="备注编辑器">
        <Row action="⌘/Ctrl + Enter" desc="保存备注" />
        <Row action="Escape" desc="取消编辑" />
      </Section>

      <Section title="其他">
        <Row action="Escape" desc="关闭右键菜单 / 取消编辑" />
      </Section>

      <p className="mt-2 rounded bg-slate-50 p-2 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        提示：所有快捷键在输入框聚焦时自动失效，不会干扰文字输入。
      </p>
    </div>
  );
}

function ExportContent() {
  return (
    <div className="space-y-3">
      <Section title="导出 Layout JSON">
        <Step num={1} text="确保后端服务运行中（编译由后端执行）" />
        <Step num={2} text="点击工具栏「导出」按钮" />
        <Step num={3} text="浏览器自动下载 .layout.json 文件" />
        <Step num={4} text="点击「复制」将 JSON 粘贴到 Agent 对话框" />
      </Section>

      <Section title="导入 JSON">
        <p>点击「导入」按钮选择文件，支持两种格式：</p>
        <Row action="mogong.document" desc="编辑器文档格式（绝对像素坐标）" />
        <Row action="mogong.layout" desc="编译产物格式（百分比自动还原为像素）" />
      </Section>

      <Section title="喂给 Agent 的 Prompt 模板">
        <blockquote className="rounded border border-slate-200 bg-slate-50 p-3 text-[11px] leading-relaxed dark:border-slate-700 dark:bg-slate-800">
          <p className="mb-2 text-slate-600 dark:text-slate-300">
            以下是一个可视化布局的编译输出，包含树状结构、百分比坐标、布局方向和语义角色。请根据这个 JSON 生成对应的 React + Tailwind 代码：
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-slate-500 dark:text-slate-400">
            <li>box 字段用百分比定位</li>
            <li>layout 决定 flex 方向 (row / column / stack)</li>
            <li>role 决定标签语义 (nav / main / footer)</li>
            <li>note 作为代码注释保留</li>
            <li>style.fill 和 style.border 映射为 Tailwind 类</li>
          </ul>
        </blockquote>
      </Section>

      <Section title="清除画布">
        <p>
          点击「清除」按钮，再次点击确认即重置所有内容。操作不可撤销。
        </p>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 排版辅助组件
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ action, desc }: { action: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-300">
        {action}
      </span>
      <span className="text-slate-600 dark:text-slate-300">{desc}</span>
    </div>
  );
}

function Step({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex gap-2">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[9px] font-bold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
        {num}
      </span>
      <span className="text-slate-600 dark:text-slate-300">{text}</span>
    </div>
  );
}
