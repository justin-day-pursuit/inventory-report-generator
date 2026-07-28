/**
 * ============================================================================
 * DATA FILE HELPERS (lib/data-store.ts)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Reads (and saves) the dairy inventory spreadsheet. This is the ONLY file that
 * knows the real column names inside the CSV — everything else in the app works
 * with the tidy field names defined in lib/inventory.ts.
 *
 * FOLDER MAP (do not rename without updating the paths below):
 *   data/inventory/inventory.csv       → live stock, one line per product batch
 *   data/inventory/inventory.seed.csv  → untouched original dataset.
 *                                        Restore with: npm run restore:inventory
 *
 * COLUMN MAP (CSV column → field used in the app):
 *   Product ID                            → productId   (shown as "Product ID")
 *   Brand + Product Name                  → name        (shown as "Name")
 *   Quantity (liters/kg)                  → quantity
 *   Quantity Sold (liters/kg)             → quantitySold
 *   Quantity in Stock (liters/kg)         → quantityInStock (what is left on hand)
 *   Storage Condition                     → storageCondition
 *   Expiration Date                       → expirationDate
 *   Date                                  → recordDate  (day the batch was recorded)
 *   Shelf Life (days)                     → shelfLifeDays
 *   Minimum Stock Threshold (liters/kg)   → minimumStockThreshold
 *   Reorder Quantity (liters/kg)          → reorderQuantity
 * Every other column in the file is kept as-is and written back untouched.
 *
 * DEPLOYMENT:
 * - On Docker/VM hosts, mount a persistent volume at /app/data so inventory
 *   updates survive redeploys (see Dockerfile / README).
 * - Ephemeral serverless filesystems will lose writes; use an external DB/API then.
 * ============================================================================
 */

import { promises as fs } from "fs";
import path from "path";
import { parseCsv, serializeCsv, type CsvTable } from "./csv";
import type { IncomingItem, InventoryItem, SalesItem } from "./inventory";

/** Absolute paths to the inventory data folder and its two files. */
const DATA_ROOT = path.join(process.cwd(), "data");

export const DATA_PATHS = {
  inventoryDir: path.join(DATA_ROOT, "inventory"),
  inventoryFile: path.join(DATA_ROOT, "inventory", "inventory.csv"),
  inventorySeedFile: path.join(DATA_ROOT, "inventory", "inventory.seed.csv"),
} as const;

/** Where the page tells the user its numbers come from. */
export const INVENTORY_SOURCE = "data/inventory/inventory.csv";

/** Exact column headings used by the dataset. Change these if the export changes. */
export const CSV_COLUMNS = {
  productId: "Product ID",
  productName: "Product Name",
  brand: "Brand",
  quantity: "Quantity (liters/kg)",
  quantitySold: "Quantity Sold (liters/kg)",
  quantityInStock: "Quantity in Stock (liters/kg)",
  storageCondition: "Storage Condition",
  expirationDate: "Expiration Date",
  recordDate: "Date",
  shelfLifeDays: "Shelf Life (days)",
  minimumStockThreshold: "Minimum Stock Threshold (liters/kg)",
  reorderQuantity: "Reorder Quantity (liters/kg)",
} as const;

/** Reads a text value from a row and turns it into a number (0 when unreadable). */
function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Keeps only the YYYY-MM-DD part of a date cell (some exports append a time). */
function toDateText(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 10);
}

/** Builds the "Name" column shown on the page: brand first, then product name. */
function buildDisplayName(brand: string, productName: string): string {
  return [brand.trim(), productName.trim()].filter(Boolean).join(" ") || "Unnamed product";
}

/**
 * Turns one CSV line into the tidy object the rest of the app uses.
 * `lineNumber` is 1 for the first data line (the line right after the header).
 */
function toInventoryItem(row: Record<string, string>, lineNumber: number): InventoryItem {
  const productId = (row[CSV_COLUMNS.productId] ?? "").trim();
  const productName = (row[CSV_COLUMNS.productName] ?? "").trim();
  const brand = (row[CSV_COLUMNS.brand] ?? "").trim();
  const quantity = toNumber(row[CSV_COLUMNS.quantity]);
  const quantitySold = toNumber(row[CSV_COLUMNS.quantitySold]);
  const inStockCell = row[CSV_COLUMNS.quantityInStock];

  return {
    // Product IDs repeat across batches, so the line number keeps each row unique.
    rowId: `P${productId || "?"}-L${lineNumber}`,
    lineNumber,
    productId,
    productName,
    brand,
    name: buildDisplayName(brand, productName),
    quantity,
    quantitySold,
    // When the "Quantity in Stock" cell is blank, fall back to quantity − sold.
    quantityInStock: inStockCell?.trim() ? toNumber(inStockCell) : quantity - quantitySold,
    storageCondition: (row[CSV_COLUMNS.storageCondition] ?? "").trim() || "Unspecified",
    expirationDate: toDateText(row[CSV_COLUMNS.expirationDate]),
    recordDate: toDateText(row[CSV_COLUMNS.recordDate]),
    shelfLifeDays: toNumber(row[CSV_COLUMNS.shelfLifeDays]),
    minimumStockThreshold: toNumber(row[CSV_COLUMNS.minimumStockThreshold]),
    reorderQuantity: toNumber(row[CSV_COLUMNS.reorderQuantity]),
  };
}

/**
 * Reads the raw spreadsheet (all columns, values as text).
 * Used by the save routine so untouched columns survive a write.
 * A missing file is treated as "no data yet" instead of a crash.
 */
export async function readInventoryTable(): Promise<CsvTable> {
  try {
    const raw = await fs.readFile(DATA_PATHS.inventoryFile, "utf8");
    return parseCsv(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { header: [], rows: [] };
    }
    throw error;
  }
}

/** Loads every product batch from data/inventory/inventory.csv. */
export async function readInventory(): Promise<InventoryItem[]> {
  const table = await readInventoryTable();
  return table.rows.map((row, index) => toInventoryItem(row, index + 1));
}

/**
 * Sales department feed, derived from the inventory spreadsheet:
 * how much of each batch has already been sold ("Quantity Sold (liters/kg)").
 * Batches that have not sold anything yet are left out.
 */
export async function readSales(): Promise<SalesItem[]> {
  const items = await readInventory();
  return items
    .filter((item) => item.quantitySold > 0)
    .map((item) => ({
      productId: item.productId,
      name: item.name,
      quantitySold: item.quantitySold,
    }));
}

/**
 * Receiving feed, derived from the inventory spreadsheet: each batch as it was
 * received — how much arrived, when it expires, and how it must be stored.
 */
export async function readIncoming(): Promise<IncomingItem[]> {
  const items = await readInventory();
  return items.map((item) => ({
    productId: item.productId,
    name: item.name,
    quantity: item.quantity,
    expirationDate: item.expirationDate,
    storageCondition: item.storageCondition,
  }));
}

/** Formats a number for the CSV: whole numbers stay whole, decimals keep 2 places. */
function toCell(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Copies the app's fields back onto a spreadsheet row, leaving other columns alone. */
function writeItemIntoRow(row: Record<string, string>, item: InventoryItem): void {
  row[CSV_COLUMNS.productId] = item.productId;
  row[CSV_COLUMNS.productName] = item.productName;
  row[CSV_COLUMNS.brand] = item.brand;
  row[CSV_COLUMNS.quantity] = toCell(item.quantity);
  row[CSV_COLUMNS.quantitySold] = toCell(item.quantitySold);
  row[CSV_COLUMNS.quantityInStock] = toCell(item.quantityInStock);
  row[CSV_COLUMNS.storageCondition] = item.storageCondition;
  row[CSV_COLUMNS.expirationDate] = item.expirationDate;
  row[CSV_COLUMNS.recordDate] = item.recordDate;
  row[CSV_COLUMNS.shelfLifeDays] = toCell(item.shelfLifeDays);
  row[CSV_COLUMNS.minimumStockThreshold] = toCell(item.minimumStockThreshold);
  row[CSV_COLUMNS.reorderQuantity] = toCell(item.reorderQuantity);
}

/**
 * Saves updated batches back to data/inventory/inventory.csv.
 *
 * HOW IT KEEPS THE FILE INTACT:
 * - It re-reads the file first, then only overwrites the cells this app manages,
 *   so extra columns (prices, farm details, locations…) are never lost.
 * - Batches with lineNumber 0 are new deliveries and are added as new lines.
 */
export async function writeInventory(items: InventoryItem[]): Promise<void> {
  const table = await readInventoryTable();
  const header = table.header.length > 0 ? table.header : Object.values(CSV_COLUMNS);

  for (const item of items) {
    const existingRow = item.lineNumber > 0 ? table.rows[item.lineNumber - 1] : undefined;
    if (existingRow) {
      writeItemIntoRow(existingRow, item);
    } else {
      const newRow: Record<string, string> = {};
      header.forEach((column) => {
        newRow[column] = "";
      });
      writeItemIntoRow(newRow, item);
      table.rows.push(newRow);
    }
  }

  await fs.mkdir(DATA_PATHS.inventoryDir, { recursive: true });
  await fs.writeFile(DATA_PATHS.inventoryFile, serializeCsv({ header, rows: table.rows }), "utf8");
}
