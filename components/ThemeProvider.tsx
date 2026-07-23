/**
 * ============================================================================
 * THEME PROVIDER (components/ThemeProvider.tsx)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Wraps the app so every page can read and change light/dark mode. Uses
 * useSyncExternalStore so SSR and hydration agree (fixes the toggle mismatch).
 *
 * HOW TO MAINTAIN:
 * - Keep DEFAULT_THEME as "dark" unless product asks to flip the default.
 * - Do not remove this provider from app/layout.tsx.
 * ============================================================================
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  getServerThemeSnapshot,
  getThemeSnapshot,
  setThemeStore,
  subscribeTheme,
  type ThemeMode,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // getServerSnapshot keeps the first client pass identical to SSR (dark).
  // After hydration, getThemeSnapshot picks up the boot-script / localStorage value.
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getServerThemeSnapshot
  );

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeStore(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeStore(theme === "dark" ? "light" : "dark");
  }, [theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Hook for buttons / pages that need the current theme.
 * Must be used under ThemeProvider (see app/layout.tsx).
 */
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}
