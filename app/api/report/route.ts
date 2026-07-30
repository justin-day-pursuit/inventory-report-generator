/**
 * ============================================================================
 * API: GET|POST /api/report
 * ============================================================================
 * WHAT THIS ENDPOINT IS FOR:
 * Builds the curated inventory report Alicia hands to the operations manager.
 *
 * Steps:
 *   1) Load the RAW spreadsheet (all CSV rows)
 *   2) Roll it into TRANSFORMED batches and run status math (generateStockReport)
 *   3) Call Google Gemini with both digests to write a readable narrative,
 *      classifications, outliers, chart data, and recommendations
 *   4) Return deterministic totals/table PLUS the AI narrative to the browser
 *
 * SECURITY:
 * The Gemini API key is read only on the server from GEMINI_API_KEY
 * (`.env.local` or the host's secrets). It is never sent to the browser.
 * Error messages are scrubbed so a leaked key cannot appear in JSON.
 *
 * HOW TO MAINTAIN:
 * - Button on the main page calls GET /api/report (no body needed).
 * - Optional POST body `{ items: [...] }` still works for tests — AI then uses
 *   those batches but still summarises the on-disk CSV as "raw" context.
 * - If Gemini is not configured, the route returns a clear 503 with setup help
 *   and still includes a rules-based narrative fallback under `ai`.
 * - `lines` / `alerts` are capped for the browser; `lineTotal` / `alertTotal`
 *   keep the real counts.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import {
  buildFallbackNarrative,
  generateAiCuratedReport,
  type AiCuratedNarrative,
} from "@/lib/ai-report";
import { readInventory, readInventoryTable } from "@/lib/data-store";
import { readGeminiEnv, sanitizeGeminiError } from "@/lib/gemini";
import { generateStockReport, type InventoryItem, type StockReport } from "@/lib/inventory";
import { parseInventoryItems } from "@/lib/validate";

const LINE_LIMIT = 200;
const ALERT_PREVIEW_LIMIT = 100;

export const dynamic = "force-dynamic";

/** Keep long AI calls from being cut off too early on slower hosts. */
export const maxDuration = 60;

type ReportPayload = StockReport & {
  lines: StockReport["lines"];
  lineTotal: number;
  alerts: StockReport["alerts"];
  alertTotal: number;
  ai: AiCuratedNarrative;
  aiMeta: {
    source: "gemini" | "fallback";
    model: string | null;
    accountLabel: string | null;
    warning?: string;
  };
};

async function buildReport(itemsOverride?: InventoryItem[]): Promise<ReportPayload> {
  const table = await readInventoryTable();
  const items = itemsOverride ?? (await readInventory());
  const report = generateStockReport(items);

  const base = {
    ...report,
    lines: report.lines.slice(0, LINE_LIMIT),
    lineTotal: report.lines.length,
    alerts: report.alerts.slice(0, ALERT_PREVIEW_LIMIT),
    alertTotal: report.alerts.length,
  };

  // Prefer live Gemini; fall back to rules-based narrative if the key is missing
  // or the model call fails — the coordinator still gets a usable report.
  if (!readGeminiEnv()) {
    return {
      ...base,
      ai: buildFallbackNarrative(report),
      aiMeta: {
        source: "fallback",
        model: null,
        accountLabel: null,
        warning:
          "Gemini API key is not configured. Add GEMINI_API_KEY to `.env.local` (see `.env.example`) or your host secrets, then restart. Showing a rules-based draft instead.",
      },
    };
  }

  try {
    const aiResult = await generateAiCuratedReport(table, report);
    return {
      ...base,
      ai: aiResult.narrative,
      aiMeta: {
        source: "gemini",
        model: aiResult.model,
        accountLabel: aiResult.accountLabel,
      },
    };
  } catch (error) {
    const warning = sanitizeGeminiError(error);
    return {
      ...base,
      ai: buildFallbackNarrative(report),
      aiMeta: {
        source: "fallback",
        model: null,
        accountLabel: readGeminiEnv()?.username || null,
        warning: `AI report unavailable (${warning}). Showing a rules-based draft instead.`,
      },
    };
  }
}

export async function GET() {
  try {
    return NextResponse.json(await buildReport());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate report.";
    return NextResponse.json(
      { error: sanitizeGeminiError(message) },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const items =
      body?.items !== undefined ? parseInventoryItems(body.items) : undefined;
    return NextResponse.json(await buildReport(items));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate report.";
    return NextResponse.json(
      { error: sanitizeGeminiError(message) },
      { status: 400 }
    );
  }
}
