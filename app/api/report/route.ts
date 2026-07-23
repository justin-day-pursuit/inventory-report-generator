/**
 * ============================================================================
 * API: POST /api/report  (also accepts GET)
 * ============================================================================
 * Builds a curated inventory status report from disk inventory, or from a
 * validated `items` array in the POST body.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { readInventory } from "@/lib/data-store";
import { generateStockReport, type InventoryItem } from "@/lib/inventory";
import { parseInventoryItems } from "@/lib/validate";

export const dynamic = "force-dynamic";

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

    if (body?.items !== undefined) {
      items = parseInventoryItems(body.items);
    }

    const report = await buildReport(items);
    return NextResponse.json(report);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate report.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
