/**
 * ============================================================================
 * API: POST /api/inventory/update
 * ============================================================================
 * Applies sales (−) and incoming supplies (+) to inventory, then saves
 * data/inventory/inventory.json. Request bodies are validated before use.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { readIncoming, readInventory, readSales, writeInventory } from "@/lib/data-store";
import {
  applyInventoryUpdates,
  buildAlerts,
  summarizeAlertCounts,
} from "@/lib/inventory";
import { parseIncomingItems, parseSalesItems } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const inventory = await readInventory();
    const sales =
      body?.sales !== undefined ? parseSalesItems(body.sales) : await readSales();
    const incoming =
      body?.incoming !== undefined
        ? parseIncomingItems(body.incoming)
        : await readIncoming();

    const updated = applyInventoryUpdates(inventory, sales, incoming);
    await writeInventory(updated);

    const alerts = buildAlerts(updated);
    return NextResponse.json({
      items: updated,
      alerts,
      alertCounts: summarizeAlertCounts(alerts),
      applied: {
        salesRows: sales.length,
        incomingRows: incoming.length,
      },
      source: "data/inventory/inventory.json",
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update inventory.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
