/**
 * ============================================================================
 * REQUEST VALIDATION (lib/validate.ts)
 * ============================================================================
 * Light schema checks for data that arrives through the API (for example a sales
 * export posted by another system). Bad payloads are rejected with a clear
 * message so wrong numbers can never reach data/inventory/inventory.csv.
 *
 * Field names here match the fields in lib/inventory.ts, not the CSV headings.
 * ============================================================================
 */

import type { IncomingItem, InventoryItem, SalesItem } from "./inventory";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accepts a non-empty text value (numbers are accepted too and turned into text). */
function asString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Accepts a real number (text such as "12.5" is accepted too). */
function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Validates a posted sales feed. Each row needs the product name
 * (brand + product, for example "Amul Milk") and how much was sold.
 */
export function parseSalesItems(value: unknown): SalesItem[] {
  if (!Array.isArray(value)) {
    throw new Error("`sales` must be an array.");
  }
  return value.map((row, index) => {
    if (!isObject(row)) throw new Error(`sales[${index}] must be an object.`);
    const name = asString(row.name);
    const quantitySold = asNumber(row.quantitySold);
    if (!name || quantitySold === null) {
      throw new Error(`sales[${index}] requires name, quantitySold (number).`);
    }
    if (quantitySold < 0) {
      throw new Error(`sales[${index}] quantitySold must be >= 0.`);
    }
    return { name, quantitySold };
  });
}

/**
 * Validates a posted receiving feed: one arriving batch per row, matched to a
 * product by its name (brand + product).
 */
export function parseIncomingItems(value: unknown): IncomingItem[] {
  if (!Array.isArray(value)) {
    throw new Error("`incoming` must be an array.");
  }
  return value.map((row, index) => {
    if (!isObject(row)) throw new Error(`incoming[${index}] must be an object.`);
    const name = asString(row.name);
    const quantity = asNumber(row.quantity);
    const expirationDate = asString(row.expirationDate);
    const storageCondition = asString(row.storageCondition);
    if (!name || quantity === null || !expirationDate || !storageCondition) {
      throw new Error(
        `incoming[${index}] requires name, quantity, expirationDate, storageCondition.`
      );
    }
    if (quantity < 0) {
      throw new Error(`incoming[${index}] quantity must be >= 0.`);
    }
    return { name, quantity, expirationDate, storageCondition };
  });
}

/**
 * Validates a posted list of products (used by POST /api/report when a caller
 * wants a report on its own snapshot instead of the saved file).
 * Optional fields fall back to sensible values so a short payload still works.
 */
export function parseInventoryItems(value: unknown): InventoryItem[] {
  if (!Array.isArray(value)) {
    throw new Error("`items` must be an array.");
  }
  return value.map((row, index) => {
    if (!isObject(row)) throw new Error(`items[${index}] must be an object.`);
    const name = asString(row.name);
    const quantity = asNumber(row.quantity);
    if (!name || quantity === null) {
      throw new Error(`items[${index}] requires at least name and quantity (number).`);
    }
    const quantitySold = asNumber(row.quantitySold) ?? 0;
    const quantityInStock = asNumber(row.quantityInStock) ?? quantity - quantitySold;

    return {
      lineNumber: asNumber(row.lineNumber) ?? 0,
      csvProductId: asString(row.csvProductId) ?? "",
      productName: asString(row.productName) ?? name,
      brand: asString(row.brand) ?? "",
      name,
      batchCount: asNumber(row.batchCount) ?? 1,
      quantity,
      quantitySold,
      quantityInStock,
      storageCondition: asString(row.storageCondition) ?? "Unspecified",
      expirationDate: asString(row.expirationDate) ?? "",
      recordDate: asString(row.recordDate) ?? "",
      shelfLifeDays: asNumber(row.shelfLifeDays) ?? 0,
      minimumStockThreshold: asNumber(row.minimumStockThreshold) ?? 0,
      reorderQuantity: asNumber(row.reorderQuantity) ?? 0,
    };
  });
}
