/**
 * ============================================================================
 * API: POST /api/inventory/update
 * ============================================================================
 * WHAT THIS ENDPOINT IS FOR:
 * Takes the currently loaded sales + incoming supplies (or re-reads them from
 * disk), applies them to inventory, saves data/inventory/inventory.json, and
 * returns the new stock list. This powers the "Update current inventory" button.
 *
 * HOW TO MAINTAIN:
 * - Math rules live in lib/inventory.ts → applyInventoryUpdates().
 * - After a successful update, inventory.json on disk is overwritten — keep a
 *   backup copy of that file if you need to undo a bad demo run.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { readIncoming, readInventory, readSales, writeInventory } from "@/lib/data-store";
import {
  applyInventoryUpdates,
  buildAlerts,
  summarizeAlertCounts,
  type IncomingItem,
  type SalesItem,
} from "@/lib/inventory";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    // Prefer payloads sent from the browser (already-loaded feeds). If missing,
    // fall back to reading the JSON files so the button still works alone.
    const inventory = await readInventory();
    const sales: SalesItem[] = Array.isArray(body?.sales)
      ? (body.sales as SalesItem[])
      : await readSales();
    const incoming: IncomingItem[] = Array.isArray(body?.incoming)
      ? (body.incoming as IncomingItem[])
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
