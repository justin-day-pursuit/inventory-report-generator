/**
 * ============================================================================
 * API: GET /api/sales
 * ============================================================================
 * WHAT THIS ENDPOINT IS FOR:
 * A read-only sales view built from the inventory spreadsheet: for every batch it
 * reports how much has already been sold ("Quantity Sold (liters/kg)").
 * Used by the check-sales page (app/check/sales/page.tsx).
 *
 * HOW TO MAINTAIN:
 * - There is no separate sales file any more; the numbers come from
 *   data/inventory/inventory.csv.
 * - Add ?limit=200 to shorten the list, or ?limit=all to get every row.
 *   The default keeps the response small because the dataset has thousands of rows.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { INVENTORY_SOURCE, readSales } from "@/lib/data-store";

/** How many rows are returned when the caller does not ask for a specific number. */
const DEFAULT_LIMIT = 500;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const items = await readSales();
    const requested = new URL(request.url).searchParams.get("limit");
    const limit =
      requested === "all"
        ? items.length
        : Math.max(1, Number(requested) || DEFAULT_LIMIT);
    const page = items.slice(0, limit);

    return NextResponse.json({
      items: page,
      count: page.length,
      total: items.length,
      limit,
      source: INVENTORY_SOURCE,
      loadedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sales data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
