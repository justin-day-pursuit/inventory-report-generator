/**
 * ============================================================================
 * API: POST /api/report  (also accepts GET for convenience)
 * ============================================================================
 * WHAT THIS ENDPOINT IS FOR:
 * Builds a curated inventory status report from the current inventory JSON
 * (and optional items posted in the request body). Powers "Generate report".
 *
 * HOW TO MAINTAIN:
 * - Report wording / recommendations are created in lib/inventory.ts
 *   → generateStockReport(). Edit that file to change manager-facing language.
 * - Future AI cross-checks should plug into generateStockReport() so this route
 *   can stay a thin wrapper.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { readInventory } from "@/lib/data-store";
import { generateStockReport, type InventoryItem } from "@/lib/inventory";

async function buildReport(itemsOverride?: InventoryItem[]) {
  const items = itemsOverride ?? (await readInventory());
  return generateStockReport(items);
}

export async function GET() {
  try {
    const report = await buildReport();
    return NextResponse.json(report);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    let items: InventoryItem[] | undefined;

    if (Array.isArray(body?.items)) {
      items = body.items as InventoryItem[];
    }

    const report = await buildReport(items);
    return NextResponse.json(report);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate report.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
