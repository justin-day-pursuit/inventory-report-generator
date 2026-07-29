/**
 * ============================================================================
 * API: GET /api/incoming
 * ============================================================================
 * WHAT THIS ENDPOINT IS FOR:
 * A read-only receiving view built from the inventory spreadsheet: every batch as
 * it was received (how much arrived, when it expires, how it must be stored).
 * Used by the check-incoming page (app/check/incoming/page.tsx).
 *
 * HOW TO MAINTAIN:
 * - There is no separate incoming file any more; the rows come from
 *   data/inventory/inventory.csv.
 * - Add ?limit=200 to shorten the list, or ?limit=all to get every row.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { INVENTORY_SOURCE, readIncoming } from "@/lib/data-store";

/** How many rows are returned when the caller does not ask for a specific number. */
const DEFAULT_LIMIT = 500;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const items = await readIncoming();
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
    const message =
      error instanceof Error ? error.message : "Failed to load incoming supplies.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
