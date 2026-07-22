/**
 * ============================================================================
 * THEME TOGGLE BUTTON (components/ThemeToggle.tsx)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Header control that switches between light mode and dark mode (the original
 * Stockflow theme). Click once to flip; the choice is remembered in the browser.
 *
 * HOW TO MAINTAIN:
 * - Label text can be reworded, but keep aria-label clear for accessibility.
 * - Place this near the top of each page users open (main + check tabs).
 * ============================================================================
 */

"use client";

import { useTheme } from "@/components/ThemeProvider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextLabel = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextLabel} mode`}
      title={`Switch to ${nextLabel} mode`}
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
      <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}

function SunIcon() {
  return (
    <svg className="theme-toggle-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.75" />
      <path
        d="M12 2.5v2.25M12 19.25V21.5M4.4 4.4l1.6 1.6M18 18l1.6 1.6M2.5 12H4.75M19.25 12H21.5M4.4 19.6l1.6-1.6M18 6l1.6-1.6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg className="theme-toggle-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M18.5 14.2A7.5 7.5 0 0 1 9.8 5.5 6.5 6.5 0 1 0 18.5 14.2Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
