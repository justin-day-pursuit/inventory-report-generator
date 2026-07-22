/**
 * ============================================================================
 * ROOT LAYOUT (app/layout.tsx)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Wraps every page with shared fonts, metadata (browser tab title), and global CSS.
 * You rarely need to edit this unless renaming the product or swapping fonts.
 * ============================================================================
 */

import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Sora } from "next/font/google";
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${sora.variable} ${plexSans.variable} ${plexMono.variable}`}>
      <body
        style={{
          fontFamily: "var(--font-plex-sans), var(--font-body)",
          // Bridge next/font CSS variables into our globals.css tokens
          ["--font-display" as string]: "var(--font-sora), var(--font-display)",
          ["--font-body" as string]: "var(--font-plex-sans), var(--font-body)",
          ["--font-mono" as string]: "var(--font-plex-mono), var(--font-mono)",
        }}
      >
        {children}
      </body>
    </html>
  );
}
