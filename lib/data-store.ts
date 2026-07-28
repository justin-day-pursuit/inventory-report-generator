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
 * HOW PRODUCTS ARE IDENTIFIED (important):
 * The spreadsheet stores history — the same product appears on hundreds of lines,
 * one per batch — and its "Product ID" column is not a unique identifier: the same
 * id is shared by every brand of that product (id 1 covers Amul Milk, Sudha Milk,
 * Raj Milk and Mother Dairy Milk). What IS unique in this file is BRAND + PRODUCT
 * NAME, so that combined name is what identifies a product throughout the app.
 *
 * The lines are grouped by that name and only the newest record of each product is
 * shown. Because a row comes from a single line, every value on it (brand, product
 * name, quantity, sold, storage condition, expiration date) belongs together.
 *
 * COLUMN MAP (CSV column → field used in the app):
 *   Brand + Product Name                  → name (the unique product, shown as "Name")
 *   Product ID                            → csvProductId — NOT an identifier; kept
 *                                           only so saves preserve that column
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
  const csvProductId = (row[CSV_COLUMNS.productId] ?? "").trim();
  const productName = (row[CSV_COLUMNS.productName] ?? "").trim();
  const brand = (row[CSV_COLUMNS.brand] ?? "").trim();
  const quantity = toNumber(row[CSV_COLUMNS.quantity]);
  const quantitySold = toNumber(row[CSV_COLUMNS.quantitySold]);
  const inStockCell = row[CSV_COLUMNS.quantityInStock];

  return {
    lineNumber,
    csvProductId,
    productName,
    brand,
    // Brand + product name — this is what identifies the product everywhere.
    name: buildDisplayName(brand, productName),
    // Filled in when the lines are grouped per product (see readInventory).
    batchCount: 1,
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

/** Loads every single line of the spreadsheet, one object per batch. */
export async function readInventoryBatches(): Promise<InventoryItem[]> {
  const table = await readInventoryTable();
  return table.rows.map((row, index) => toInventoryItem(row, index + 1));
}

/** True when batch `a` is a more recent record than batch `b`. */
function isNewerRecord(a: InventoryItem, b: InventoryItem): boolean {
  if (a.recordDate !== b.recordDate) return a.recordDate > b.recordDate;
  // Same date on both lines: the one further down the file wins.
  return a.lineNumber > b.lineNumber;
}

/**
 * Loads the list of UNIQUE products shown on the page.
 *
 * The spreadsheet holds history (hundreds of batch lines per product), so the
 * lines are grouped by product name (brand + product) and each product is
 * represented by its newest record. `batchCount` says how many lines that product
 * has in the file. Products come back in alphabetical order by name, which is the
 * order shown in the Name column.
 */
export async function readInventory(): Promise<InventoryItem[]> {
  const batches = await readInventoryBatches();
  const newestPerProduct = new Map<string, InventoryItem>();

  for (const batch of batches) {
    // Upper/lower case differences between lines must not create two products.
    const key = batch.name.toLowerCase();
    const known = newestPerProduct.get(key);
    if (!known) {
      newestPerProduct.set(key, { ...batch });
      continue;
    }
    known.batchCount += 1;
    if (isNewerRecord(batch, known)) {
      // Keep the running batch count while switching to the newer record.
      newestPerProduct.set(key, { ...batch, batchCount: known.batchCount });
    }
  }

  return Array.from(newestPerProduct.values()).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Sales department feed, derived from the inventory spreadsheet:
 * how much of each product has sold on its newest record
 * ("Quantity Sold (liters/kg)"). Products that have not sold anything are left out.
 */
export async function readSales(): Promise<SalesItem[]> {
  const items = await readInventory();
  return items
    .filter((item) => item.quantitySold > 0)
    .map((item) => ({
      name: item.name,
      quantitySold: item.quantitySold,
    }));
}

/**
 * Receiving feed, derived from the inventory spreadsheet: the newest received
 * batch of each product — how much arrived, when it expires, how it is stored.
 */
export async function readIncoming(): Promise<IncomingItem[]> {
  const items = await readInventory();
  return items.map((item) => ({
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

/**
 * Writes a number into a cell, but only when the value really changed.
 * This keeps cells such as "959.1" exactly as the file had them instead of
 * rewriting them as "959.10" on every save.
 */
function setNumberCell(row: Record<string, string>, column: string, value: number): void {
  const current = row[column];
  if (current && current.trim() && toNumber(current) === value) return;
  row[column] = toCell(value);
}

/** Writes text into a cell, but only when the value really changed. */
function setTextCell(row: Record<string, string>, column: string, value: string): void {
  if (row[column] === value) return;
  row[column] = value;
}

/**
 * Works out how a brand-new product should be written into the spreadsheet.
 *
 * A delivery only carries the full name ("Nestle Milk"). The file keeps brand and
 * product name in separate columns and numbers each product, so this looks for a
 * product name the file already knows ("Milk") at the end of the new name and, when
 * it finds one, splits the name and reuses that product's number. If nothing
 * matches, the name is written as-is and the number is left for someone to fill in.
 */
function describeNewProduct(
  table: CsvTable,
  fullName: string
): { brand: string; productName: string; csvProductId: string } {
  const name = fullName.trim();
  const lowerName = name.toLowerCase();

  for (const row of table.rows) {
    const knownName = (row[CSV_COLUMNS.productName] ?? "").trim();
    if (!knownName) continue;
    const knownLower = knownName.toLowerCase();
    if (lowerName === knownLower) {
      return {
        brand: "",
        productName: knownName,
        csvProductId: (row[CSV_COLUMNS.productId] ?? "").trim(),
      };
    }
    if (lowerName.endsWith(` ${knownLower}`)) {
      return {
        brand: name.slice(0, name.length - knownName.length).trim(),
        productName: knownName,
        csvProductId: (row[CSV_COLUMNS.productId] ?? "").trim(),
      };
    }
  }

  return { brand: "", productName: name, csvProductId: "" };
}

/**
 * Copies the app's fields back onto a spreadsheet row, leaving other columns alone.
 * The "Product ID" cell keeps the file's own value; the app never identifies
 * products by it (brand + product name does that), it only preserves the column.
 */
function writeItemIntoRow(
  row: Record<string, string>,
  item: InventoryItem,
  csvProductId: string
): void {
  setTextCell(row, CSV_COLUMNS.productId, csvProductId);
  setTextCell(row, CSV_COLUMNS.productName, item.productName);
  setTextCell(row, CSV_COLUMNS.brand, item.brand);
  setNumberCell(row, CSV_COLUMNS.quantity, item.quantity);
  setNumberCell(row, CSV_COLUMNS.quantitySold, item.quantitySold);
  setNumberCell(row, CSV_COLUMNS.quantityInStock, item.quantityInStock);
  setTextCell(row, CSV_COLUMNS.storageCondition, item.storageCondition);
  setTextCell(row, CSV_COLUMNS.expirationDate, item.expirationDate);
  setTextCell(row, CSV_COLUMNS.recordDate, item.recordDate);
  setNumberCell(row, CSV_COLUMNS.shelfLifeDays, item.shelfLifeDays);
  setNumberCell(row, CSV_COLUMNS.minimumStockThreshold, item.minimumStockThreshold);
  setNumberCell(row, CSV_COLUMNS.reorderQuantity, item.reorderQuantity);
}

/**
 * Saves updated products back to data/inventory/inventory.csv.
 *
 * HOW IT KEEPS THE FILE INTACT:
 * - It re-reads the file first, then only overwrites the cells this app manages,
 *   so extra columns (prices, farm details, locations…) are never lost.
 * - Each product is written back onto the line it was read from (its newest
 *   record). Products with lineNumber 0 are new deliveries and become new lines.
 */
export async function writeInventory(items: InventoryItem[]): Promise<void> {
  const table = await readInventoryTable();
  const header = table.header.length > 0 ? table.header : Object.values(CSV_COLUMNS);

  for (const item of items) {
    const existingRow = item.lineNumber > 0 ? table.rows[item.lineNumber - 1] : undefined;
    if (existingRow) {
      writeItemIntoRow(existingRow, item, item.csvProductId);
      continue;
    }
    const newRow: Record<string, string> = {};
    header.forEach((column) => {
      newRow[column] = "";
    });
    // A brand-new product still has to fit the file's shape: brand and product
    // name in their own columns, and the number the file uses for that product.
    const placement = describeNewProduct(table, item.name);
    writeItemIntoRow(
      newRow,
      { ...item, brand: placement.brand, productName: placement.productName },
      item.csvProductId || placement.csvProductId
    );
    table.rows.push(newRow);
  }

  await fs.mkdir(DATA_PATHS.inventoryDir, { recursive: true });
  await fs.writeFile(DATA_PATHS.inventoryFile, serializeCsv({ header, rows: table.rows }), "utf8");
}
