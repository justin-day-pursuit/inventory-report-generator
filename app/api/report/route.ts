/**
 * ============================================================================
 * API: GET /api/report  (also accepts POST)
 * ============================================================================
 * Builds the curated stock report from data/inventory/inventory.csv, or from a
 * validated `items` array in the POST body.
 *
 * Totals and recommendations always cover every batch; only the most urgent lines
 * and a short alert preview are sent to the browser. `lineTotal` / `alertTotal`
 * report the real numbers.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { readInventory } from "@/lib/data-store";
import { generateStockReport, type InventoryItem } from "@/lib/inventory";
import { parseInventoryItems } from "@/lib/validate";

const LINE_LIMIT = 200;
const ALERT_PREVIEW_LIMIT = 100;

export const dynamic = "force-dynamic";

async function buildReport(itemsOverride?: InventoryItem[]) {
  const items = itemsOverride ?? (await readInventory());
  const report = generateStockReport(items);
  return {
    ...report,
    lines: report.lines.slice(0, LINE_LIMIT),
    lineTotal: report.lines.length,
    alerts: report.alerts.slice(0, ALERT_PREVIEW_LIMIT),
    alertTotal: report.alerts.length,
  };
}

export async function GET() {
  try {
    return NextResponse.json(await buildReport());
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const items = body?.items !== undefined ? parseInventoryItems(body.items) : undefined;
    return NextResponse.json(await buildReport(items));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate report.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
