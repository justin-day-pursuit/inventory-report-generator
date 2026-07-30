/**
 * ============================================================================
 * API: POST /api/inventory/transform
 * ============================================================================
 * Takes raw CSV text (from a dropped file or from /api/inventory/source) and
 * runs the same batch transform the on-disk reader uses:
 *   Location + Product Name + Brand + Storage Condition + Sales Channel
 * then builds alert badges against the app's status clock.
 *
 * Body: { "csvText": "...." }
 * Response matches GET /api/inventory so the webpage can populate in one step.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { inventoryFromCsvText } from "@/lib/data-store";
import {
  APP_REFERENCE_DATE,
  appToday,
  buildAlerts,
  summarizeAlertCounts,
} from "@/lib/inventory";

/** How many individual alerts are sent to the browser for the alert chip strip. */
const ALERT_PREVIEW_LIMIT = 100;

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const csvText = typeof body?.csvText === "string" ? body.csvText : "";
    if (!csvText.trim()) {
      return NextResponse.json(
        { error: "Request body must include non-empty csvText." },
        { status: 400 }
      );
    }

    const items = inventoryFromCsvText(csvText);
    if (items.length === 0) {
      return NextResponse.json(
        { error: "No inventory rows found in that CSV. Check the header columns." },
        { status: 400 }
      );
    }

    const alerts = buildAlerts(items);
    return NextResponse.json({
      items,
      count: items.length,
      sourceRecordCount: items.reduce((sum, item) => sum + item.sourceRowCount, 0),
      referenceDate: appToday().toISOString().slice(0, 10) || APP_REFERENCE_DATE,
      alerts: alerts.slice(0, ALERT_PREVIEW_LIMIT),
      alertTotal: alerts.length,
      alertCounts: summarizeAlertCounts(alerts),
      source: "uploaded-or-codebase-csv",
      transformedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to transform inventory CSV.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
