/**
 * ============================================================================
 * THEME PROVIDER (components/ThemeProvider.tsx)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Wraps the app so every page can read and change light/dark mode. It writes
 * data-theme on <html>, which drives the CSS variables in globals.css.
 *
 * HOW TO MAINTAIN:
 * - Keep DEFAULT_THEME as "dark" unless product asks to flip the default.
 * - ThemeToggle is the only UI control users need — do not remove this provider
 *   from app/layout.tsx or the toggle will stop working.
 * - The inline script in app/layout.tsx sets data-theme before React loads;
 *   this provider reads that attribute on first client render (no flash, no
 *   extra setState-in-effect).
 * ============================================================================
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isThemeMode,
  type ThemeMode,
} from "@/lib/theme";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(theme: ThemeMode) {
  document.documentElement.setAttribute("data-theme", theme);
}

/** Read theme already applied by the layout boot script (client only). */
function readInitialTheme(): ThemeMode {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const attr = document.documentElement.getAttribute("data-theme");
  return isThemeMode(attr) ? attr : DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(readInitialTheme);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    applyTheme(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference just won't persist across reloads.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [setTheme, theme]);

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
