/**
 * ============================================================================
 * API: GET /api/inventory
 * ============================================================================
 * WHAT THIS ENDPOINT IS FOR:
 * Returns the unique products held in data/inventory/inventory.csv together with
 * the alert badge counts. The main page calls this when it first loads and whenever
 * you press Refresh.
 *
 * Each product appears once — identified by its name, brand plus product — and
 * carries the values from its newest line in the spreadsheet. `sourceRecordCount`
 * reports how many lines of batch history those products were built from.
 *
 * HOW TO MAINTAIN:
 * - Do not hard-code products here. Edit data/inventory/inventory.csv instead.
 * - Only a short preview of the alert list is sent to the browser (the page shows
 *   a few chips plus a "+N more" note); `alertTotal` reports the true number.
 * - Later, replace readInventory() with a live warehouse-database call if needed.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { INVENTORY_SOURCE, readInventory } from "@/lib/data-store";
import { buildAlerts, summarizeAlertCounts } from "@/lib/inventory";

/** How many individual alerts are sent to the browser for the alert chip strip. */
const ALERT_PREVIEW_LIMIT = 100;

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await readInventory();
    const alerts = buildAlerts(items);
    return NextResponse.json({
      items,
      count: items.length,
      sourceRecordCount: items.reduce((sum, item) => sum + item.batchCount, 0),
      alerts: alerts.slice(0, ALERT_PREVIEW_LIMIT),
      alertTotal: alerts.length,
      alertCounts: summarizeAlertCounts(alerts),
      source: INVENTORY_SOURCE,
      loadedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load inventory.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
