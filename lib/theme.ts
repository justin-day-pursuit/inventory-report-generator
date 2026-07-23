/**
 * ============================================================================
 * THEME HELPERS + STORE (lib/theme.ts)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Light / dark mode constants and a tiny external store used by ThemeProvider.
 * Dark mode is the original Stockflow look. Light mode is the brighter theme.
 *
 * HOW TO MAINTAIN:
 * - Do not rename THEME_STORAGE_KEY without also updating the boot script in
 *   app/layout.tsx (it prevents a flash of the wrong theme on load).
 * - useSyncExternalStore keeps SSR HTML and the first client paint in sync,
 *   which avoids the React hydration mismatch on the theme toggle.
 * ============================================================================
 */

export type ThemeMode = "light" | "dark";

/** localStorage key used by the theme store and the layout boot script. */
export const THEME_STORAGE_KEY = "stockflow-theme";

/** Default theme = current Stockflow dark console look. */
export const DEFAULT_THEME: ThemeMode = "dark";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

function applyDomTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

/* -------------------------------------------------------------------------- */
/* External store (for useSyncExternalStore — hydration-safe)                 */
/* -------------------------------------------------------------------------- */

let storeTheme: ThemeMode = DEFAULT_THEME;
let hydratedFromDom = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Read whatever the boot script already put on <html>, once, on the client. */
function ensureClientHydrated() {
  if (hydratedFromDom || typeof document === "undefined") return;
  const attr = document.documentElement.getAttribute("data-theme");
  if (isThemeMode(attr)) {
    storeTheme = attr;
  }
  hydratedFromDom = true;
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Client snapshot — may differ from the server after the boot script runs. */
export function getThemeSnapshot(): ThemeMode {
  ensureClientHydrated();
  return storeTheme;
}

/** Server + hydration snapshot — always the default so SSR HTML matches. */
export function getServerThemeSnapshot(): ThemeMode {
  return DEFAULT_THEME;
}

export function setThemeStore(next: ThemeMode) {
  storeTheme = next;
  hydratedFromDom = true;
  applyDomTheme(next);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Preference just won't persist across reloads.
  }
  emit();
}
