import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { ThemeMode } from "../lib/api";

const DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Resolve the theme to `data-theme` on <html> and sync the native title bar.
 * In "system" mode it follows the OS and listens for live changes; the choice
 * is cached in localStorage for the FOUC guard in index.html.
 */
export function useTheme(theme: ThemeMode): void {
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia(DARK_QUERY);
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && mq.matches);
      root.setAttribute("data-theme", dark ? "dark" : "light");
    };
    apply();
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // ignore storage failures (private mode, quota)
    }
    // null lets the OS decide the title bar (system mode).
    getCurrentWindow()
      .setTheme(theme === "system" ? null : theme)
      .catch(() => {});
    if (theme === "system") {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    }
  }, [theme]);
}
