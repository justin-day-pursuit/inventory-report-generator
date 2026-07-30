/**
 * ============================================================================
 * API: GET /api/inventory
 * ============================================================================
 * Returns the unique inventory BATCHES from data/inventory/inventory.csv together
 * with alert badge counts. Kept for direct API use and health of the on-disk file.
 * The main webpage no longer auto-calls this on load — it stages CSV text first
 * (drop zone or /api/inventory/source) then posts to /api/inventory/transform.
 *
 * A batch is Location + Product Name + Brand + Storage Condition + Sales Channel.
 * `sourceRecordCount` is how many CSV lines those batches were built from.
 * `referenceDate` is the fake "today" used for shelf-life status (see APP_REFERENCE_DATE).
 * `alertCounts` counts BATCHES in each status (including the morning "Need action"
 * overview). Individual status badges can overlap; do not add them up.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { INVENTORY_SOURCE, readInventory } from "@/lib/data-store";
import {
  APP_REFERENCE_DATE,
  appToday,
  buildAlerts,
  summarizeBatchStatusCounts,
} from "@/lib/inventory";

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
      sourceRecordCount: items.reduce((sum, item) => sum + item.sourceRowCount, 0),
      referenceDate: appToday().toISOString().slice(0, 10) || APP_REFERENCE_DATE,
      alerts: alerts.slice(0, ALERT_PREVIEW_LIMIT),
      alertTotal: alerts.length,
      alertCounts: summarizeBatchStatusCounts(items),
      source: INVENTORY_SOURCE,
      loadedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load inventory.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
