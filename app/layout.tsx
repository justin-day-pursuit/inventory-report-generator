/**
 * ============================================================================
 * ROOT LAYOUT (app/layout.tsx)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Wraps every page with shared fonts, metadata (browser tab title), global CSS,
 * and the light/dark ThemeProvider.
 *
 * HOW TO MAINTAIN:
 * - The beforeInteractive Script reads localStorage BEFORE paint so users do not
 *   see a flash of the wrong theme. If you rename THEME_STORAGE_KEY in
 *   lib/theme.ts, update the string in that script too.
 * - Use next/script (not a raw <script> in JSX) to avoid the React 19 warning
 *   about script tags inside components.
 * ============================================================================
 */

import type { Metadata } from "next";
import Script from "next/script";
import { IBM_Plex_Mono, IBM_Plex_Sans, Sora } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/theme";
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

/** Tiny boot script: apply saved theme before React hydrates (avoids flash). */
const themeBootScript = `
(function () {
  try {
    var key = ${JSON.stringify(THEME_STORAGE_KEY)};
    var stored = localStorage.getItem(key);
    var theme = (stored === "light" || stored === "dark") ? stored : ${JSON.stringify(DEFAULT_THEME)};
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", ${JSON.stringify(DEFAULT_THEME)});
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
      data-theme={DEFAULT_THEME}
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
