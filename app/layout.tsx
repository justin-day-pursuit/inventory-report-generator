/**
 * ============================================================================
 * ROOT LAYOUT (app/layout.tsx)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Wraps every page with shared fonts, metadata (browser tab title), global CSS,
 * and the light/dark ThemeProvider.
 *
 * HOW TO MAINTAIN:
 * - The beforeInteractive Script picks the theme BEFORE paint so users do not
 *   see a flash of the wrong colours. Order of preference:
 *     1) saved choice in localStorage (after the user used the theme toggle)
 *     2) device / OS setting (prefers-color-scheme)
 *     3) SSR_FALLBACK_THEME
 * - If you rename THEME_STORAGE_KEY in lib/theme.ts, update this file's import
 *   (the boot script reads the constant — keep them in sync).
 * - Use next/script (not a raw <script> in JSX) to avoid the React 19 warning
 *   about script tags inside components.
 * ============================================================================
 */

import type { Metadata } from "next";
import Script from "next/script";
import { IBM_Plex_Mono, IBM_Plex_Sans, Sora } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SSR_FALLBACK_THEME, THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Stockflow — Inventory Monitoring",
  description:
    "Monitor inventory, sync sales and incoming supplies, and generate stock reports.",
};

/**
 * Tiny boot script: apply theme before React hydrates (avoids a flash).
 * Uses the saved toggle if present; otherwise follows the OS light/dark setting.
 */
const themeBootScript = `
(function () {
  var fallback = ${JSON.stringify(SSR_FALLBACK_THEME)};
  try {
    var key = ${JSON.stringify(THEME_STORAGE_KEY)};
    var stored = localStorage.getItem(key);
    var theme;
    if (stored === "light" || stored === "dark") {
      theme = stored;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      theme = "dark";
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      theme = "light";
    } else {
      theme = fallback;
    }
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", fallback);
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme={SSR_FALLBACK_THEME}
      className={`${sora.variable} ${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body
        style={{
          fontFamily: "var(--font-plex-sans), var(--font-body)",
          ["--font-display" as string]: "var(--font-sora), var(--font-display)",
          ["--font-body" as string]: "var(--font-plex-sans), var(--font-body)",
          ["--font-mono" as string]: "var(--font-plex-mono), var(--font-mono)",
        }}
      >
        <Script id="stockflow-theme-boot" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
