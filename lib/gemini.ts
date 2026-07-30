/**
 * ============================================================================
 * GOOGLE GEMINI CREDENTIALS (lib/gemini.ts)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Safely reads the Gemini API settings from the server environment and builds
 * a client the curated-report route can call. The browser NEVER sees these
 * values — only server code (app/api/*) should import this file.
 *
 * WHERE THE SECRETS LIVE:
 *   Local:   `.env.local`  (copy from `.env.example`, fill in real values)
 *   Hosting: same names in the host's Environment / Secrets panel
 *            (Vercel, Railway, Docker `-e`, etc.)
 *
 * VARIABLES:
 *   GEMINI_API_USERNAME — label for which Google account owns the key
 *                         (kept for the team; not sent to Google)
 *   GEMINI_API_KEY      — the secret key from https://aistudio.google.com/apikey
 *   GEMINI_MODEL        — optional; defaults to a free-tier friendly model
 *
 * HOW TO MAINTAIN:
 * - Never rename these to NEXT_PUBLIC_* — that would ship the key to the browser.
 * - Never log, return, or put the key into API JSON responses.
 * - If you rotate the key in Google AI Studio, update `.env.local` (or the host
 *   secret) and restart the app.
 * ============================================================================
 */

import "server-only";

import { GoogleGenAI } from "@google/genai";

/** Free-tier friendly default; override with GEMINI_MODEL in `.env.local`. */
export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export type GeminiEnv = {
  /** Account label only — never sent to Google. */
  username: string;
  /** Secret API key — server-only. */
  apiKey: string;
  /** Model id, e.g. gemini-2.5-flash. */
  model: string;
};

/**
 * Reads Gemini settings from process.env.
 * Returns null when the API key is missing or still a placeholder.
 */
export function readGeminiEnv(): GeminiEnv | null {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  const username = (process.env.GEMINI_API_USERNAME ?? "").trim();
  const model =
    (process.env.GEMINI_MODEL ?? "").trim() || DEFAULT_GEMINI_MODEL;

  if (!apiKey || looksLikePlaceholder(apiKey)) {
    return null;
  }

  return { username, apiKey, model };
}

/** True when the value is still the template text from `.env.example`. */
function looksLikePlaceholder(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("paste-your-") ||
    lower.includes("your-api-key") ||
    lower.includes("your_api_key") ||
    lower === "changeme" ||
    lower === "xxx"
  );
}

/**
 * Builds a Gemini client that talks to Google from the SERVER only.
 * Throws a plain-English error when the key is not configured.
 */
export function createGeminiClient(): { ai: GoogleGenAI; env: GeminiEnv } {
  const env = readGeminiEnv();
  if (!env) {
    throw new Error(
      "Gemini API key is not set. Add GEMINI_API_KEY to `.env.local` " +
        "(see `.env.example`), or set the same name as a secret on your host, " +
        "then restart the app."
    );
  }

  // Pass the key explicitly so we never rely on accidental global env pickup
  // of a different GOOGLE_API_KEY from the host machine.
  const ai = new GoogleGenAI({ apiKey: env.apiKey });
  return { ai, env };
}

/**
 * Strips secrets from error text before it is shown in the UI or API JSON.
 * Also blanks common Google AI Studio key shapes (start with "AIza").
 */
export function sanitizeGeminiError(error: unknown, apiKey?: string): string {
  let message =
    error instanceof Error ? error.message : "Gemini request failed.";

  if (apiKey && apiKey.length > 0) {
    message = message.split(apiKey).join("[REDACTED_API_KEY]");
  }

  // Catch a leaked key even when we did not have the env value handy.
  message = message.replace(/AIza[0-9A-Za-z_-]{10,}/g, "[REDACTED_API_KEY]");

  // Avoid dumping long stack-like payloads into the coordinator UI.
  if (message.length > 400) {
    message = `${message.slice(0, 400)}…`;
  }

  return message;
}
