/**
 * ============================================================================
 * API: GET /api/health
 * ============================================================================
 * Lightweight readiness check for load balancers and container orchestrators.
 * Does not mutate data. Returns 200 when the process can serve traffic and
 * can see the inventory data file.
 * ============================================================================
 */

import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import { DATA_PATHS } from "@/lib/data-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await fs.access(DATA_PATHS.inventoryFile);
    return NextResponse.json({
      status: "ok",
      service: "stockflow",
      time: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        service: "stockflow",
        error: "Inventory data file is not reachable.",
        time: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
