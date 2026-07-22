/**
 * ============================================================================
 * API: GET /api/incoming
 * ============================================================================
 * WHAT THIS ENDPOINT IS FOR:
 * Loads incoming supply rows from data/incoming/incoming.json (mock stand-in
 * for the future warehousing / receiving API). Used by "Load incoming supplies".
 *
 * HOW TO MAINTAIN:
 * - Put receiving exports into data/incoming/incoming.json (array of objects).
 * - Required fields per row: sku, name, quantity, expiration, storageRequirements.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { readIncoming } from "@/lib/data-store";

export async function GET() {
  try {
    const items = await readIncoming();
    return NextResponse.json({
      items,
      count: items.length,
      source: "data/incoming/incoming.json",
      loadedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load incoming supplies.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
