export type InventoryItem = {
  sku: string;
  name: string;
  quantity: number;
  reorderThreshold: number;
  unitPrice: number;
};

export type StockStatus = "out_of_stock" | "low_stock" | "in_stock";

export type StockLine = InventoryItem & {
  status: StockStatus;
  stockValue: number;
};

export type StockReport = {
  generatedAt: string;
  totals: {
    itemCount: number;
    totalUnits: number;
    totalStockValue: number;
    outOfStockCount: number;
    lowStockCount: number;
    inStockCount: number;
  };
  lines: StockLine[];
};

export function classifyStatus(item: InventoryItem): StockStatus {
  if (item.quantity <= 0) return "out_of_stock";
  if (item.quantity <= item.reorderThreshold) return "low_stock";
  return "in_stock";
}

export function generateStockReport(items: InventoryItem[]): StockReport {
  const lines: StockLine[] = items.map((item) => ({
    ...item,
    status: classifyStatus(item),
    stockValue: round2(item.quantity * item.unitPrice),
  }));

  const totals = {
    itemCount: lines.length,
    totalUnits: lines.reduce((sum, l) => sum + l.quantity, 0),
    totalStockValue: round2(lines.reduce((sum, l) => sum + l.stockValue, 0)),
    outOfStockCount: lines.filter((l) => l.status === "out_of_stock").length,
    lowStockCount: lines.filter((l) => l.status === "low_stock").length,
    inStockCount: lines.filter((l) => l.status === "in_stock").length,
  };

  return {
    generatedAt: new Date().toISOString(),
    totals,
    lines,
  };
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Parses inventory data from CSV text. Expected header:
 * sku,name,quantity,reorderThreshold,unitPrice
 */
export function parseInventoryCsv(csv: string): InventoryItem[] {
  const rows = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (rows.length === 0) return [];

  const header = rows[0].toLowerCase().split(",").map((h) => h.trim());
  const idx = {
    sku: header.indexOf("sku"),
    name: header.indexOf("name"),
    quantity: header.indexOf("quantity"),
    reorderThreshold: header.indexOf("reorderthreshold"),
    unitPrice: header.indexOf("unitprice"),
  };

  const missing = Object.entries(idx)
    .filter(([, i]) => i === -1)
    .map(([key]) => key);
  if (missing.length > 0) {
    throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
  }

  return rows.slice(1).map((row, rowNumber) => {
    const cells = row.split(",").map((c) => c.trim());
    const item: InventoryItem = {
      sku: cells[idx.sku] ?? "",
      name: cells[idx.name] ?? "",
      quantity: toNumber(cells[idx.quantity], rowNumber, "quantity"),
      reorderThreshold: toNumber(cells[idx.reorderThreshold], rowNumber, "reorderThreshold"),
      unitPrice: toNumber(cells[idx.unitPrice], rowNumber, "unitPrice"),
    };
    return item;
  });
}

function toNumber(value: string | undefined, rowNumber: number, field: string): number {
  const parsed = Number(value);
  if (value === undefined || value === "" || Number.isNaN(parsed)) {
    throw new Error(`Invalid ${field} on data row ${rowNumber + 1}: "${value ?? ""}"`);
  }
  return parsed;
}
