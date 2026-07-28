/**
 * ============================================================================
 * API: POST /api/inventory/update
 * ============================================================================
 * Applies a sales feed (−) and a receiving feed (+) to the stock levels in
 * data/inventory/inventory.csv and saves the file.
 *
 * IMPORTANT — this endpoint expects the feeds in the request body:
 *   { "sales": [{ productId, name, quantitySold }],
 *     "incoming": [{ productId, name, quantity, expirationDate, storageCondition }] }
 * Both keys are optional; a missing key simply means "nothing to apply".
 * The feeds are NOT read from the CSV automatically, because the CSV already
 * contains the sold quantities — re-applying them would double-count sales.
 *
 * NOTE: The "Update current inventory" button on the main page is currently
 * switched off (its onClick is commented out in app/page.tsx), so nothing in the
 * web UI calls this endpoint today. It stays available for other systems.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { INVENTORY_SOURCE, readInventory, writeInventory } from "@/lib/data-store";
import {
  applyInventoryUpdates,
  buildAlerts,
  summarizeAlertCounts,
} from "@/lib/inventory";
import { parseIncomingItems, parseSalesItems } from "@/lib/validate";

/** How many individual alerts are sent back with the response. */
const ALERT_PREVIEW_LIMIT = 100;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));

    const inventory = await readInventory();
    const sales = body?.sales !== undefined ? parseSalesItems(body.sales) : [];
    const incoming =
      body?.incoming !== undefined ? parseIncomingItems(body.incoming) : [];

    const updated = applyInventoryUpdates(inventory, sales, incoming);
    await writeInventory(updated);

    const alerts = buildAlerts(updated);
    return NextResponse.json({
      items: updated,
      count: updated.length,
      alerts: alerts.slice(0, ALERT_PREVIEW_LIMIT),
      alertTotal: alerts.length,
      alertCounts: summarizeAlertCounts(alerts),
      applied: {
        salesRows: sales.length,
        incomingRows: incoming.length,
      },
      source: INVENTORY_SOURCE,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update inventory.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
