/**
 * ============================================================================
 * THEME HELPERS (lib/theme.ts)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Shared constants for light / dark mode. Dark mode is the original Stockflow
 * look. Light mode is the brighter reading theme.
 *
 * HOW TO MAINTAIN:
 * - Do not rename the localStorage key without also updating the inline script
 *   in app/layout.tsx (it prevents a flash of the wrong theme on load).
 * ============================================================================
 */

export type ThemeMode = "light" | "dark";

/** localStorage key used by ThemeProvider and the layout bootstrap script. */
export const THEME_STORAGE_KEY = "stockflow-theme";

/** Default theme = current Stockflow dark console look. */
export const DEFAULT_THEME: ThemeMode = "dark";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}
