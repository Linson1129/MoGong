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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-4 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="墨工使用教程"
    >
      <div className="relative w-full max-w-lg rounded-overlay border border-glass-rim bg-glass-body shadow-overlay backdrop-blur-glass backdrop-saturate-(--glass-saturate)">
        {/* 标题栏 */}
        <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">
            墨工使用教程
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded-control text-ink-faint hover:bg-ink/10 hover:text-ink-secondary"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-1 border-b border-hairline px-5 pb-2 pt-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-control px-3 py-1 text-xs font-medium transition-colors ${
                tab === t.id
                  ? "bg-ink/10 text-ink"
                  : "text-ink-muted hover:bg-ink/5 hover:text-ink-secondary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 内容区 */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 text-xs leading-relaxed text-ink-secondary">
          {tab === "draw" && <DrawContent />}
          {tab === "keys" && <KeysContent />}
          {tab === "export" && <ExportContent />}
        </div>

        {/* 底部 */}
        <div className="border-t border-hairline px-5 py-2.5 text-right">
          <button
            type="button"
            onClick={onClose}
            className="rounded-control bg-ink/10 px-3 py-1 text-xs text-ink-secondary hover:bg-ink/20"
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
        <Row action="纸面上拖拽" desc="绘制矩形，无需长按：超过 3 像素就开始出预览" />
        <Row action="拖出 < 32×32" desc="自动成为圆形图章 (Stamp)" />
        <Row action="单击矩形" desc="选中该区域" />
        <Row action="Option/Alt + 左键拖拽" desc="移动区域的唯一方式（普通拖拽现在只会画子区域）" />
        <Row action="拖拽控制点" desc="调整大小（四角 + 四边中点，共 8 个）" />
        <Row action="Alt + 拖角点" desc="从中心对称缩放" />
        <Row action="双击矩形" desc="打开备注编辑器" />
        <Row action="右键矩形" desc="打开上下文菜单（置顶/置底/删除）" />
      </Section>

      <Section title="画布导航">
        <Row action="滚轮" desc="以鼠标为锚点缩放" />
        <Row action="纸面外拖拽" desc="平移画布；在纸上以外的地方画不出区域" />
        <Row action="中键拖拽" desc="平移画布（在纸面上也有效）" />
        <Row action="方向键" desc="平移画布一挡 40px（Shift 为 4×，即 160px）" />
        <Row action="单击百分比" desc="重置缩放为 100%" />
        <Row action="双击百分比" desc="输入自定义缩放值 (50-150%)" />
      </Section>

      <Section title="外观编辑">
        <p className="text-ink-muted">
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

      <p className="mt-2 rounded bg-surface p-2 text-ink-muted">
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
        <blockquote className="rounded border border-hairline bg-surface p-3 text-[11px] leading-relaxed">
          <p className="mb-2 text-ink-secondary">
            以下是一个可视化布局的编译输出，包含树状结构、百分比坐标、布局方向和语义角色。请根据这个 JSON 生成对应的 React + Tailwind 代码：
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-ink-muted">
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
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
        {title}
      </h3>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ action, desc }: { action: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <span className="shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-secondary">
        {action}
      </span>
      <span className="text-ink-secondary">{desc}</span>
    </div>
  );
}

function Step({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex gap-2">
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-wash text-[9px] font-bold text-accent">
        {num}
      </span>
      <span className="text-ink-secondary">{text}</span>
    </div>
  );
}
