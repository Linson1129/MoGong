/**
 * Theme store: light/dark switching.
 *
 * The .dark class on <html> selects which token block in app/globals.css applies. This store owns
 * the class, the persisted preference, and the system default that seeds it on first visit -- and
 * nothing else.
 *
 * It used to also write the canvas colours as inline custom properties on <html>. Inline styles beat
 * every stylesheet rule, which made this file the real source of truth for --canvas-* while the
 * tokens in CSS looked dead to anyone editing them.
 *
 * Components carry no `dark:` variants: every colour they name is a semantic token, and the token is
 * what changes. A `dark:` class here would mean a component that knows about themes, which is the
 * arrangement that let 200-odd hard-coded slate shades survive the first token migration.
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
  // Fall back to the OS preference when the user has never chosen.
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  // The colours themselves live in app/globals.css, keyed off this class.
  document.documentElement.classList.toggle("dark", theme === "dark");
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
 * Applies the stored or system theme after client mount.
 * Only ever called from a useEffect, so the server render stays theme-agnostic and the page cannot
 * hydrate into a colour scheme the user never picked.
 */
export function hydrateTheme(): void {
  const theme = getInitialTheme();
  useThemeStore.getState().setTheme(theme);
}
