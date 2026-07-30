/**
 * ============================================================================
 * API: GET /api/inventory/source
 * ============================================================================
 * Returns the raw text of data/inventory/inventory.csv so the webpage can
 * "Load inventory from codebase" without displaying it yet. The page holds this
 * text until the user presses Display.
 *
 * Response: { csvText, source, bytes, loadedAt }
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { INVENTORY_SOURCE, readInventoryCsvText } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const csvText = await readInventoryCsvText();
    if (!csvText.trim()) {
      return NextResponse.json(
        { error: "Inventory CSV was not found in the codebase." },
        { status: 404 }
      );
    }
    return NextResponse.json({
      csvText,
      source: INVENTORY_SOURCE,
      bytes: Buffer.byteLength(csvText, "utf8"),
      loadedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to read inventory CSV.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
