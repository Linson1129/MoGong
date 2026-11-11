/**
 * 主题存储：管理深色/浅色模式切换。
 *
 * 通过在 <html> 上添加/移除 .dark 类来驱动 Tailwind 的 dark: 变体，
 * 同时切换 CSS 自定义属性供 SVG 画布读取。
 * 偏好持久化到 localStorage，首次访问时跟随系统 prefers-color-scheme。
 */

import { create } from "zustand";

const THEME_KEY = "mogong-theme";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
}

interface ThemeActions {
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

export type ThemeStore = ThemeState & ThemeActions;

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // ignore
  }
  // 跟随系统偏好
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  // 设置 CSS 变量供 SVG 画布读取
  root.style.setProperty("--canvas-bg", theme === "dark" ? "#1E293B" : "#E8EDF4");
  root.style.setProperty("--canvas-frame", theme === "dark" ? "#475569" : "#94A3B8");
  root.style.setProperty("--canvas-tick", theme === "dark" ? "#64748B" : "#94A3B8");
  root.style.setProperty("--canvas-label", theme === "dark" ? "#94A3B8" : "#64748B");
  root.style.setProperty("--note-color", theme === "dark" ? "#CBD5E1" : "#334155");
  root.style.setProperty("--hover-dim-color", theme === "dark" ? "#94A3B8" : "#64748B");
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: "light",

  toggleTheme: () => {
    const next = get().theme === "dark" ? "light" : "dark";
    set({ theme: next });
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // ignore
    }
  },

  setTheme: (theme) => {
    set({ theme });
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // ignore
    }
  },
}));

/**
 * 在客户端挂载后初始化主题。
 * 仅在 useEffect 中调用，避免 SSR Hydration 不匹配。
 */
export function hydrateTheme(): void {
  const theme = getInitialTheme();
  useThemeStore.getState().setTheme(theme);
}
