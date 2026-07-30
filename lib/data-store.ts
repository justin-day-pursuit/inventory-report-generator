/**
 * ============================================================================
 * DATA FILE HELPERS (lib/data-store.ts)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Reads (and saves) the dairy inventory spreadsheet. This is the ONLY file that
 * knows the real CSV column names. Everything else in the app works with the tidy
 * field names defined in lib/inventory.ts.
 *
 * FOLDER MAP:
 *   data/inventory/inventory.csv       → live stock (writable)
 *   data/inventory/inventory.seed.csv  → untouched original — npm run restore:inventory
 *
 * HOW BATCHES ARE BUILT (unique identifier):
 * CSV lines that share ALL of these are rolled into one batch:
 *   Location + Product Name + Brand + Storage Condition + Sales Channel
 *
 * For each batch we compute:
 *   Quantity in Stock, Quantity Sold, Minimum Stock Threshold, Reorder Quantity,
 *     Total Value, Approx. Total Revenue  → SUM of the source lines
 *   Listed Quantity ("Quantity (liters/kg)") → also SUM (kept for write-back /
 *     price weighting; not the on-hand figure shown in the list)
 *   Price per Unit           → listed-quantity-weighted AVERAGE (summing unit
 *                               prices would be meaningless)
 *   Expiration Date          → earliest of each line's
 *                               min(Expiration Date, Production Date + Shelf Life)
 *   Customer Locations       → running list of distinct Customer Location values
 *   Location / Sales Channel / Storage / Brand / Product Name
 *                            → the shared key values (identical across the lines)
 *
 * Stock status (lib/inventory.ts) uses Quantity in Stock as on-hand and
 * Quantity Sold as a restock-soon signal.
 *
 * DEPLOYMENT: mount a persistent volume at /app/data so writes survive redeploys.
 * ============================================================================
 */

import { promises as fs } from "fs";
import path from "path";
import { parseCsv, serializeCsv, type CsvTable } from "./csv";
import type { IncomingItem, InventoryItem, SalesItem } from "./inventory";

const DATA_ROOT = path.join(process.cwd(), "data");

export const DATA_PATHS = {
  inventoryDir: path.join(DATA_ROOT, "inventory"),
  inventoryFile: path.join(DATA_ROOT, "inventory", "inventory.csv"),
  inventorySeedFile: path.join(DATA_ROOT, "inventory", "inventory.seed.csv"),
} as const;

/** Where the page tells the user its numbers come from. */
export const INVENTORY_SOURCE = "data/inventory/inventory.csv";

/**
 * Exact CSV column headings used by the dataset.
 * Change these strings only if the export's header row changes.
 */
export const CSV_COLUMNS = {
  location: "Location",
  productId: "Product ID",
  productName: "Product Name",
  brand: "Brand",
  quantity: "Quantity (liters/kg)",
  pricePerUnit: "Price per Unit",
  totalValue: "Total Value",
  shelfLifeDays: "Shelf Life (days)",
  storageCondition: "Storage Condition",
  productionDate: "Production Date",
  expirationDate: "Expiration Date",
  quantitySold: "Quantity Sold (liters/kg)",
  approxTotalRevenue: "Approx. Total Revenue(INR)",
  customerLocation: "Customer Location",
  salesChannel: "Sales Channel",
  quantityInStock: "Quantity in Stock (liters/kg)",
  minimumStockThreshold: "Minimum Stock Threshold (liters/kg)",
  reorderQuantity: "Reorder Quantity (liters/kg)",
  recordDate: "Date",
} as const;

/** Reads a text value from a row and turns it into a number (0 when unusable). */
function toNumber(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value.replaceAll(",", "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Keeps only the YYYY-MM-DD part of a date cell. */
function toDateText(value: string | undefined): string {
  return (value ?? "").trim().slice(0, 10);
}

/** Builds the Name column: brand first, then product name. */
function buildDisplayName(brand: string, productName: string): string {
  return [brand.trim(), productName.trim()].filter(Boolean).join(" ") || "Unnamed product";
}

/**
 * Builds the unique batch key from the five fields that identify a batch.
 * Order is fixed so the same combination always hashes to the same string.
 */
export function buildBatchKey(
  location: string,
  productName: string,
  brand: string,
  storageCondition: string,
  salesChannel: string
): string {
  return [location, productName, brand, storageCondition, salesChannel]
    .map((part) => part.trim().toLowerCase())
    .join("|");
}

/**
 * Effective expiration for one CSV line: whichever comes first —
 * the printed Expiration Date, or Production Date + Shelf Life (days).
 * Returns "" when neither side can be worked out.
 */
export function effectiveExpirationForRow(row: Record<string, string>): string {
  const expiration = toDateText(row[CSV_COLUMNS.expirationDate]);
  const production = toDateText(row[CSV_COLUMNS.productionDate]);
  const shelfDays = toNumber(row[CSV_COLUMNS.shelfLifeDays]);

  let fromShelf = "";
  if (production && shelfDays >= 0) {
    const produced = new Date(`${production}T00:00:00`);
    if (!Number.isNaN(produced.getTime())) {
      produced.setDate(produced.getDate() + Math.round(shelfDays));
      fromShelf = produced.toISOString().slice(0, 10);
    }
  }

  if (expiration && fromShelf) return expiration <= fromShelf ? expiration : fromShelf;
  return expiration || fromShelf;
}

/** One CSV line after light parsing — only used while building batches. */
type SourceRow = {
  lineNumber: number;
  raw: Record<string, string>;
  location: string;
  productName: string;
  brand: string;
  storageCondition: string;
  salesChannel: string;
  csvProductId: string;
  quantity: number;
  quantitySold: number;
  quantityInStock: number;
  minimumStockThreshold: number;
  reorderQuantity: number;
  totalValue: number;
  approxTotalRevenue: number;
  pricePerUnit: number;
  customerLocation: string;
  recordDate: string;
  effectiveExpiration: string;
};

/** Turns one spreadsheet line into the temporary SourceRow shape. */
function toSourceRow(row: Record<string, string>, lineNumber: number): SourceRow {
  return {
    lineNumber,
    raw: row,
    location: (row[CSV_COLUMNS.location] ?? "").trim() || "Unspecified",
    productName: (row[CSV_COLUMNS.productName] ?? "").trim(),
    brand: (row[CSV_COLUMNS.brand] ?? "").trim(),
    storageCondition: (row[CSV_COLUMNS.storageCondition] ?? "").trim() || "Unspecified",
    salesChannel: (row[CSV_COLUMNS.salesChannel] ?? "").trim() || "Unspecified",
    csvProductId: (row[CSV_COLUMNS.productId] ?? "").trim(),
    quantity: toNumber(row[CSV_COLUMNS.quantity]),
    quantitySold: toNumber(row[CSV_COLUMNS.quantitySold]),
    quantityInStock: toNumber(row[CSV_COLUMNS.quantityInStock]),
    minimumStockThreshold: toNumber(row[CSV_COLUMNS.minimumStockThreshold]),
    reorderQuantity: toNumber(row[CSV_COLUMNS.reorderQuantity]),
    totalValue: toNumber(row[CSV_COLUMNS.totalValue]),
    approxTotalRevenue: toNumber(row[CSV_COLUMNS.approxTotalRevenue]),
    pricePerUnit: toNumber(row[CSV_COLUMNS.pricePerUnit]),
    customerLocation: (row[CSV_COLUMNS.customerLocation] ?? "").trim(),
    recordDate: toDateText(row[CSV_COLUMNS.recordDate]),
    effectiveExpiration: effectiveExpirationForRow(row),
  };
}

/**
 * Rolls a group of source rows that share the same batch key into one
 * InventoryItem, applying the sum / earliest-date / running-list rules.
 */
function aggregateBatch(rows: SourceRow[]): InventoryItem {
  // Newest recording date wins for metadata we keep from a single line
  // (product id, and the line number used if we write the batch back).
  const newest = rows.reduce((best, row) => {
    if (!best) return row;
    if (row.recordDate !== best.recordDate) {
      return row.recordDate > best.recordDate ? row : best;
    }
    return row.lineNumber > best.lineNumber ? row : best;
  });

  const listedQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  const quantityInStock = rows.reduce((sum, row) => sum + row.quantityInStock, 0);
  const quantitySold = rows.reduce((sum, row) => sum + row.quantitySold, 0);
  const priceWeight = rows.reduce((sum, row) => sum + row.pricePerUnit * row.quantity, 0);

  const customerLocations = Array.from(
    new Set(rows.map((row) => row.customerLocation).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  // Earliest effective expiration across the group = most urgent date to act on.
  const expirationDate = rows
    .map((row) => row.effectiveExpiration)
    .filter(Boolean)
    .sort()[0] ?? "";

  return {
    batchKey: buildBatchKey(
      newest.location,
      newest.productName,
      newest.brand,
      newest.storageCondition,
      newest.salesChannel
    ),
    lineNumber: newest.lineNumber,
    sourceRowCount: rows.length,
    csvProductId: newest.csvProductId,
    productName: newest.productName,
    brand: newest.brand,
    name: buildDisplayName(newest.brand, newest.productName),
    location: newest.location,
    salesChannel: newest.salesChannel,
    storageCondition: newest.storageCondition,
    // `quantity` is Quantity in Stock — the on-hand figure the list displays.
    quantity: quantityInStock,
    quantitySold,
    listedQuantity,
    minimumStockThreshold: rows.reduce((sum, row) => sum + row.minimumStockThreshold, 0),
    reorderQuantity: rows.reduce((sum, row) => sum + row.reorderQuantity, 0),
    expirationDate,
    totalValue: rows.reduce((sum, row) => sum + row.totalValue, 0),
    approxTotalRevenue: rows.reduce((sum, row) => sum + row.approxTotalRevenue, 0),
    pricePerUnit: listedQuantity > 0 ? priceWeight / listedQuantity : 0,
    customerLocations,
    recordDate: newest.recordDate,
  };
}

/**
 * Reads the raw spreadsheet (all columns, values as text).
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

/**
 * Turns CSV text into UNIQUE BATCHES for the coordinator list.
 *
 * Safe to call from API routes that receive an uploaded file, or from the
 * on-disk reader below. Does not touch the filesystem itself.
 *
 * Steps:
 *   1) Parse the CSV text into rows
 *   2) Group by Location + Product Name + Brand + Storage Condition + Sales Channel
 *   3) Sum / earliest-date / running-list as documented at the top of this file
 *   4) Sort by name, then location, then sales channel for a stable table order
 */
export function inventoryFromCsvText(csvText: string): InventoryItem[] {
  const table = parseCsv(csvText);
  const groups = new Map<string, SourceRow[]>();

  table.rows.forEach((row, index) => {
    const source = toSourceRow(row, index + 1);
    const key = buildBatchKey(
      source.location,
      source.productName,
      source.brand,
      source.storageCondition,
      source.salesChannel
    );
    const bucket = groups.get(key);
    if (bucket) bucket.push(source);
    else groups.set(key, [source]);
  });

  return Array.from(groups.values())
    .map(aggregateBatch)
    .sort(
      (a, b) =>
        a.name.localeCompare(b.name) ||
        a.location.localeCompare(b.location) ||
        a.salesChannel.localeCompare(b.salesChannel)
    );
}

/**
 * Loads the on-disk inventory CSV and returns UNIQUE BATCHES.
 * Used by APIs that still read data/inventory/inventory.csv directly.
 */
export async function readInventory(): Promise<InventoryItem[]> {
  const raw = await fs.readFile(DATA_PATHS.inventoryFile, "utf8").catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  });
  return inventoryFromCsvText(raw);
}

/**
 * Reads the raw on-disk inventory CSV as plain text (for "Load from codebase").
 * Returns an empty string when the file is missing.
 */
export async function readInventoryCsvText(): Promise<string> {
  try {
    return await fs.readFile(DATA_PATHS.inventoryFile, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

/**
 * Sales department view derived from the inventory spreadsheet.
 * One row per batch with the summed Quantity Sold (liters/kg).
 * Kept so /api/sales and the check page keep working while sync is paused.
 */
export async function readSales(): Promise<SalesItem[]> {
  const items = await readInventory();
  return items.map((item) => ({
    name: item.name,
    quantitySold: item.quantitySold,
  }));
}

/**
 * Receiving view derived from the inventory spreadsheet: each batch as it stands
 * (quantity, expiration, storage). Used by /api/incoming.
 */
export async function readIncoming(): Promise<IncomingItem[]> {
  const items = await readInventory();
  return items.map((item) => ({
    name: item.name,
    quantity: item.quantity,
    expirationDate: item.expirationDate,
    storageCondition: item.storageCondition,
    location: item.location,
    salesChannel: item.salesChannel,
  }));
}

/** Formats a number for the CSV: whole numbers stay whole, decimals keep 2 places. */
function toCell(value: number): string {
  if (!Number.isFinite(value)) return "";
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Writes a number into a cell only when the value really changed, so untouched
 * formatting (for example "959.1") is not rewritten as "959.10" on every save.
 */
function setNumberCell(row: Record<string, string>, column: string, value: number): void {
  const current = row[column];
  if (current && current.trim() && toNumber(current) === value) return;
  row[column] = toCell(value);
}

/** Writes text into a cell only when the value really changed. */
function setTextCell(row: Record<string, string>, column: string, value: string): void {
  if (row[column] === value) return;
  row[column] = value;
}

/**
 * Looks up how a brand-new product should be split into Brand / Product Name /
 * Product ID columns when appending a line the file has never seen.
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
 * Copies the batch's fields onto one spreadsheet row (the newest source line).
 * Only the cells this app manages are touched; every other column is left alone.
 *
 * NOTE: A batch is a SUM of several lines. Writing the summed Quantity in Stock /
 * Quantity Sold / listed Quantity back onto a single line is a lossy
 * simplification used only when the paused Update flow is re-enabled.
 * Restoring from inventory.seed.csv undoes that.
 */
function writeItemIntoRow(
  row: Record<string, string>,
  item: InventoryItem,
  csvProductId: string
): void {
  setTextCell(row, CSV_COLUMNS.productId, csvProductId);
  setTextCell(row, CSV_COLUMNS.productName, item.productName);
  setTextCell(row, CSV_COLUMNS.brand, item.brand);
  setTextCell(row, CSV_COLUMNS.location, item.location);
  setTextCell(row, CSV_COLUMNS.salesChannel, item.salesChannel);
  setTextCell(row, CSV_COLUMNS.storageCondition, item.storageCondition);
  setNumberCell(row, CSV_COLUMNS.quantity, item.listedQuantity);
  setNumberCell(row, CSV_COLUMNS.quantityInStock, item.quantity);
  setNumberCell(row, CSV_COLUMNS.quantitySold, item.quantitySold);
  setNumberCell(row, CSV_COLUMNS.minimumStockThreshold, item.minimumStockThreshold);
  setNumberCell(row, CSV_COLUMNS.reorderQuantity, item.reorderQuantity);
  setTextCell(row, CSV_COLUMNS.expirationDate, item.expirationDate);
  setTextCell(row, CSV_COLUMNS.recordDate, item.recordDate);
}

/**
 * Saves updated batches back to data/inventory/inventory.csv.
 * Existing batches are written onto their newest source line; brand-new batches
 * (lineNumber 0) are appended as new lines.
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
    const placement = describeNewProduct(table, item.name);
    writeItemIntoRow(
      newRow,
      {
        ...item,
        brand: item.brand || placement.brand,
        productName: item.productName || placement.productName,
      },
      item.csvProductId || placement.csvProductId
    );
    table.rows.push(newRow);
  }

  await fs.mkdir(DATA_PATHS.inventoryDir, { recursive: true });
  await fs.writeFile(DATA_PATHS.inventoryFile, serializeCsv({ header, rows: table.rows }), "utf8");
}
