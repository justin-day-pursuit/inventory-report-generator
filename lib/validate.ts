/**
 * ============================================================================
 * REQUEST VALIDATION (lib/validate.ts)
 * ============================================================================
 * Light schema checks for API bodies before inventory updates / reports.
 * Rejects clearly invalid payloads so bad client data cannot corrupt stock.
 * ============================================================================
 */

import type { IncomingItem, InventoryItem, SalesItem } from "./inventory";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseSalesItems(value: unknown): SalesItem[] {
  if (!Array.isArray(value)) {
    throw new Error("`sales` must be an array.");
  }
  return value.map((row, index) => {
    if (!isObject(row)) throw new Error(`sales[${index}] must be an object.`);
    const sku = asString(row.sku);
    const name = asString(row.name);
    const quantity = asNumber(row.quantity);
    const rateOfSale = asNumber(row.rateOfSale);
    if (!sku || !name || quantity === null || rateOfSale === null) {
      throw new Error(
        `sales[${index}] requires sku, name, quantity (number), rateOfSale (number).`
      );
    }
    if (quantity < 0 || rateOfSale < 0) {
      throw new Error(`sales[${index}] quantity and rateOfSale must be >= 0.`);
    }
    return { sku, name, quantity, rateOfSale };
  });
}

export function parseIncomingItems(value: unknown): IncomingItem[] {
  if (!Array.isArray(value)) {
    throw new Error("`incoming` must be an array.");
  }
  return value.map((row, index) => {
    if (!isObject(row)) throw new Error(`incoming[${index}] must be an object.`);
    const sku = asString(row.sku);
    const name = asString(row.name);
    const quantity = asNumber(row.quantity);
    const expiration = asString(row.expiration);
    const storageRequirements = asString(row.storageRequirements);
    if (!sku || !name || quantity === null || !expiration || !storageRequirements) {
      throw new Error(
        `incoming[${index}] requires sku, name, quantity, expiration, storageRequirements.`
      );
    }
    if (quantity < 0) {
      throw new Error(`incoming[${index}] quantity must be >= 0.`);
    }
    return { sku, name, quantity, expiration, storageRequirements };
  });
}

export function parseInventoryItems(value: unknown): InventoryItem[] {
  if (!Array.isArray(value)) {
    throw new Error("`items` must be an array.");
  }
  return value.map((row, index) => {
    if (!isObject(row)) throw new Error(`items[${index}] must be an object.`);
    const sku = asString(row.sku);
    const name = asString(row.name);
    const quantity = asNumber(row.quantity);
    const expiration = asString(row.expiration);
    const rateOfSale = asNumber(row.rateOfSale);
    const storageRequirements = asString(row.storageRequirements);
    const reorderThreshold = asNumber(row.reorderThreshold);
    const overstockThreshold = asNumber(row.overstockThreshold);
    if (
      !sku ||
      !name ||
      quantity === null ||
      !expiration ||
      rateOfSale === null ||
      !storageRequirements ||
      reorderThreshold === null ||
      overstockThreshold === null
    ) {
      throw new Error(
        `items[${index}] is missing required inventory fields.`
      );
    }
    return {
      sku,
      name,
      quantity,
      expiration,
      rateOfSale,
      storageRequirements,
      reorderThreshold,
      overstockThreshold,
    };
  });
}
