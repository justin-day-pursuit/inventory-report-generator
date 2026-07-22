import { NextResponse } from "next/server";
import { generateStockReport, parseInventoryCsv, type InventoryItem } from "@/lib/inventory";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    let items: InventoryItem[];
    if (typeof body?.csv === "string") {
      items = parseInventoryCsv(body.csv);
    } else if (Array.isArray(body?.items)) {
      items = body.items as InventoryItem[];
    } else {
      return NextResponse.json(
        { error: "Request must include either `csv` (string) or `items` (array)." },
        { status: 400 }
      );
    }

    const report = generateStockReport(items);
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate report.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
