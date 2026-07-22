/**
 * ============================================================================
 * API: GET /api/inventory
 * ============================================================================
 * WHAT THIS ENDPOINT IS FOR:
 * Returns the current inventory list from data/inventory/inventory.json.
 * The main page calls this when it first loads (and whenever you refresh stock).
 *
 * HOW TO MAINTAIN:
 * - Do not hard-code products here. Edit data/inventory/inventory.json instead.
 * - Later, replace readInventory() with a live warehouse-database call if needed.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { readInventory } from "@/lib/data-store";
import { buildAlerts, summarizeAlertCounts } from "@/lib/inventory";

export async function GET() {
  try {
    const items = await readInventory();
    const alerts = buildAlerts(items);
    return NextResponse.json({
      items,
      alerts,
      alertCounts: summarizeAlertCounts(alerts),
      source: "data/inventory/inventory.json",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load inventory.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
