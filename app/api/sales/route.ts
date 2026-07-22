/**
 * ============================================================================
 * API: GET /api/sales
 * ============================================================================
 * WHAT THIS ENDPOINT IS FOR:
 * Loads sold-product rows from data/sales/sales.json (mock stand-in for the
 * future sales-department API). Used by the "Load sales data" button.
 *
 * HOW TO MAINTAIN:
 * - Put sales exports into data/sales/sales.json (array of objects).
 * - Required fields per row: sku, quantitySold. Optional: name, saleDate.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { readSales } from "@/lib/data-store";

export async function GET() {
  try {
    const items = await readSales();
    return NextResponse.json({
      items,
      count: items.length,
      source: "data/sales/sales.json",
      loadedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load sales data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
