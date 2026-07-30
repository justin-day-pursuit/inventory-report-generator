/**
 * ============================================================================
 * THEME HELPERS + STORE (lib/theme.ts)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Light / dark mode constants and a tiny external store used by ThemeProvider.
 *
 * DEFAULT BEHAVIOUR:
 * On first visit (no saved choice), the theme follows the device / OS setting:
 *   - System light (day)  → light theme
 *   - System dark (night) → dark theme
 * After the user clicks the theme toggle, that choice is saved in localStorage
 * and wins over the system setting until they clear site data.
 *
 * HOW TO MAINTAIN:
 * - Do not rename THEME_STORAGE_KEY without also updating the boot script in
 *   app/layout.tsx (it prevents a flash of the wrong theme on load).
 * - SSR_FALLBACK_THEME is only used when the server cannot read the OS setting
 *   (and as a last-resort if matchMedia is unavailable). Prefer changing the
 *   boot script / getSystemTheme — not this constant — for product behaviour.
 * - useSyncExternalStore keeps SSR HTML and the first client paint in sync,
 *   which avoids the React hydration mismatch on the theme toggle.
 * ============================================================================
 */

export type ThemeMode = "light" | "dark";

/** localStorage key used by the theme store and the layout boot script. */
export const THEME_STORAGE_KEY = "stockflow-theme";

/**
 * Fallback when we cannot read the OS preference (SSR, old browsers, errors).
 * Real first paint on the client uses getSystemTheme() via the layout boot script.
 */
export const SSR_FALLBACK_THEME: ThemeMode = "light";

/** @deprecated Use SSR_FALLBACK_THEME — kept so older imports keep working. */
export const DEFAULT_THEME: ThemeMode = SSR_FALLBACK_THEME;

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark";
}

/**
 * Reads the device / OS colour scheme (light or dark).
 * Safe to call only in the browser; returns SSR_FALLBACK_THEME on the server.
 */
export function getSystemTheme(): ThemeMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return SSR_FALLBACK_THEME;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/**
 * Theme to use right now: saved toggle choice if present, otherwise the OS theme.
 */
export function getPreferredTheme(): ThemeMode {
  if (typeof window === "undefined") return SSR_FALLBACK_THEME;
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
  } catch {
    // localStorage blocked — fall through to system.
  }
  return getSystemTheme();
}

function applyDomTheme(theme: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

/* -------------------------------------------------------------------------- */
/* External store (for useSyncExternalStore — hydration-safe)                 */
/* -------------------------------------------------------------------------- */

let storeTheme: ThemeMode = SSR_FALLBACK_THEME;
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
  } else {
    storeTheme = getPreferredTheme();
    applyDomTheme(storeTheme);
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

/** Server + hydration snapshot — stable fallback so SSR HTML matches. */
export function getServerThemeSnapshot(): ThemeMode {
  return SSR_FALLBACK_THEME;
}

/**
 * Apply a theme and optionally remember it.
 * - persist: true (default) → user toggle; write localStorage
 * - persist: false → following the OS; do not write localStorage
 */
export function setThemeStore(next: ThemeMode, options?: { persist?: boolean }) {
  const persist = options?.persist !== false;
  storeTheme = next;
  hydratedFromDom = true;
  applyDomTheme(next);
  if (persist) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Preference just won't persist across reloads.
    }
  }
  emit();
}

/**
 * While the user has NOT picked a theme, keep following OS light/dark changes.
 * Returns a cleanup function (call from useEffect).
 *
 * HOW TO MAINTAIN: ThemeProvider should call this once on mount. If the user
 * has a saved stockflow-theme value, OS changes are ignored until they clear it.
 */
export function startSystemThemeListener(): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  const media = window.matchMedia("(prefers-color-scheme: dark)");

  const syncFromSystemIfNoOverride = () => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (isThemeMode(stored)) return;
    } catch {
      // Treat as no override.
    }
    setThemeStore(getSystemTheme(), { persist: false });
  };

  // Modern browsers
  if (typeof media.addEventListener === "function") {
    media.addEventListener("change", syncFromSystemIfNoOverride);
    return () => media.removeEventListener("change", syncFromSystemIfNoOverride);
  }

  // Older Safari
  media.addListener(syncFromSystemIfNoOverride);
  return () => media.removeListener(syncFromSystemIfNoOverride);
}
