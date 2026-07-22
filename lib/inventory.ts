/**
 * ============================================================================
 * INVENTORY CORE LOGIC (lib/inventory.ts)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * This file holds the shared "brain" of the inventory tool. It does NOT talk to the
 * browser or the network by itself. Instead, the web pages and API routes call these
 * helpers to:
 *   1) Describe what inventory / sales / supply records look like
 *   2) Build alert badges (low stock, expiring soon, overstocked, etc.)
 *   3) Apply sales (-) and incoming supplies (+) to update stock levels
 *   4) Build a curated stock report for the operations manager
 *
 * HOW TO MAINTAIN (non-technical notes):
 * - If you add a new field to inventory (for example "supplier"), update the
 *   InventoryItem type below AND the JSON files under data/inventory/.
 * - Alert rules (how many days before expiration counts as "expiring soon") live
 *   near the top in the ALERT SETTINGS section — change those numbers carefully.
 * - Do not delete functions that are imported by app/api/* — the buttons on the
 *   webpage rely on them.
 * ============================================================================
 */

/* -------------------------------------------------------------------------- */
/* ALERT SETTINGS — tweak these numbers when business rules change            */
/* -------------------------------------------------------------------------- */

/** How many days before the expiration date we start warning the coordinator. */
export const EXPIRING_SOON_DAYS = 5;

/** Default reorder threshold if a product JSON row forgets to include one. */
export const DEFAULT_REORDER_THRESHOLD = 10;

/** Default overstock threshold if a product JSON row forgets to include one. */
export const DEFAULT_OVERSTOCK_THRESHOLD = 80;

/* -------------------------------------------------------------------------- */
/* DATA SHAPES — these match the JSON files under /data                       */
/* -------------------------------------------------------------------------- */

/**
 * One product currently sitting in the warehouse / store.
 * Source file: data/inventory/inventory.json
 */
export type InventoryItem = {
  /** Unique product code, e.g. "SKU-001". Must match sales and supply SKUs. */
  sku: string;
  /** Human-readable product name shown in the list. */
  name: string;
  /** How many units are on hand right now. */
  quantity: number;
  /** Expiration date as YYYY-MM-DD (ISO date string). */
  expiration: string;
  /** Average units sold per day — used for trend notes in the report. */
  rateOfSale: number;
  /** Where / how this product must be stored (fridge, freezer, dry shelf…). */
  storageRequirements: string;
  /** When quantity drops to this number or below, flag as understocked. */
  reorderThreshold: number;
  /** When quantity rises to this number or above, flag as overstocked. */
  overstockThreshold: number;
};

/**
 * One sales line from the sales department feed.
 * Source file: data/sales/sales.json
 */
export type SalesItem = {
  sku: string;
  name?: string;
  /** Units sold that should be subtracted from inventory. */
  quantitySold: number;
  /** Optional sale date YYYY-MM-DD for auditing. */
  saleDate?: string;
};

/**
 * One incoming supply line from warehousing / receiving.
 * Source file: data/incoming/incoming.json
 *
 * Extra fields (rateOfSale, storageRequirements, thresholds) are optional and only
 * needed when the shipment introduces a brand-new SKU not already in inventory.
 */
export type IncomingItem = {
  sku: string;
  name?: string;
  /** Units received that should be added to inventory. */
  quantityReceived: number;
  /** New expiration for this lot (YYYY-MM-DD). Used when present. */
  expiration?: string;
  receivedDate?: string;
  rateOfSale?: number;
  storageRequirements?: string;
  reorderThreshold?: number;
  overstockThreshold?: number;
};

/** Categories of attention badges shown at the top of the monitoring page. */
export type AlertKind =
  | "out_of_stock"
  | "understocked"
  | "overstocked"
  | "expiring_soon"
  | "expired";

export type InventoryAlert = {
  kind: AlertKind;
  sku: string;
  name: string;
  message: string;
};

export type StockStatus =
  | "out_of_stock"
  | "understocked"
  | "overstocked"
  | "expiring_soon"
  | "expired"
  | "healthy";

export type StockLine = InventoryItem & {
  status: StockStatus;
  daysUntilExpiration: number;
};

export type StockReport = {
  generatedAt: string;
  summary: string;
  recommendations: string[];
  totals: {
    itemCount: number;
    totalUnits: number;
    outOfStockCount: number;
    understockedCount: number;
    overstockedCount: number;
    expiringSoonCount: number;
    expiredCount: number;
    healthyCount: number;
  };
  lines: StockLine[];
  alerts: InventoryAlert[];
};

/* -------------------------------------------------------------------------- */
/* DATE HELPERS                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Turns an expiration string into a whole number of days from "today".
 * Negative numbers mean the product is already past its expiration date.
 *
 * MAINTENANCE: Uses the computer's local calendar day. If you later need
 * warehouse-timezone accuracy, change this helper only — callers stay the same.
 */
export function daysUntil(expiration: string, now: Date = new Date()): number {
  const exp = new Date(`${expiration}T00:00:00`);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((exp.getTime() - start.getTime()) / msPerDay);
}

/* -------------------------------------------------------------------------- */
/* STATUS + ALERTS                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Picks the single most urgent status for a product.
 * Priority order (worst first): expired → out of stock → expiring soon →
 * understocked → overstocked → healthy.
 *
 * MAINTENANCE: If operations wants a different priority (e.g. understocked
 * before expiring), reorder the if-statements below.
 */
export function classifyStatus(item: InventoryItem, now: Date = new Date()): StockStatus {
  const days = daysUntil(item.expiration, now);
  const reorder = item.reorderThreshold ?? DEFAULT_REORDER_THRESHOLD;
  const overstock = item.overstockThreshold ?? DEFAULT_OVERSTOCK_THRESHOLD;

  if (days < 0) return "expired";
  if (item.quantity <= 0) return "out_of_stock";
  if (days <= EXPIRING_SOON_DAYS) return "expiring_soon";
  if (item.quantity <= reorder) return "understocked";
  if (item.quantity >= overstock) return "overstocked";
  return "healthy";
}

/**
 * Builds the alert badge list shown at the top of the monitoring page.
 * One product can produce more than one alert (e.g. low stock AND expiring soon).
 */
export function buildAlerts(items: InventoryItem[], now: Date = new Date()): InventoryAlert[] {
  const alerts: InventoryAlert[] = [];

  for (const item of items) {
    const days = daysUntil(item.expiration, now);
    const reorder = item.reorderThreshold ?? DEFAULT_REORDER_THRESHOLD;
    const overstock = item.overstockThreshold ?? DEFAULT_OVERSTOCK_THRESHOLD;

    if (days < 0) {
      alerts.push({
        kind: "expired",
        sku: item.sku,
        name: item.name,
        message: `Expired ${Math.abs(days)} day(s) ago — remove or markdown.`,
      });
    } else if (days <= EXPIRING_SOON_DAYS) {
      alerts.push({
        kind: "expiring_soon",
        sku: item.sku,
        name: item.name,
        message: `Expires in ${days} day(s) — prioritize sale or transfer.`,
      });
    }

    if (item.quantity <= 0) {
      alerts.push({
        kind: "out_of_stock",
        sku: item.sku,
        name: item.name,
        message: "Out of stock — lost sales risk until restocked.",
      });
    } else if (item.quantity <= reorder) {
      alerts.push({
        kind: "understocked",
        sku: item.sku,
        name: item.name,
        message: `Only ${item.quantity} left (reorder at ${reorder}).`,
      });
    }

    if (item.quantity >= overstock) {
      alerts.push({
        kind: "overstocked",
        sku: item.sku,
        name: item.name,
        message: `${item.quantity} on hand exceeds overstock limit of ${overstock}.`,
      });
    }
  }

  return alerts;
}

/**
 * Counts how many alerts of each kind exist — used by the top summary cards.
 */
export function summarizeAlertCounts(alerts: InventoryAlert[]) {
  return {
    outOfStock: alerts.filter((a) => a.kind === "out_of_stock").length,
    understocked: alerts.filter((a) => a.kind === "understocked").length,
    overstocked: alerts.filter((a) => a.kind === "overstocked").length,
    expiringSoon: alerts.filter((a) => a.kind === "expiring_soon").length,
    expired: alerts.filter((a) => a.kind === "expired").length,
  };
}

/* -------------------------------------------------------------------------- */
/* INVENTORY UPDATES (sales − and supplies +)                                 */
/* -------------------------------------------------------------------------- */

/**
 * Applies incoming supplies and sales to a copy of the current inventory list.
 *
 * ORDER OF OPERATIONS (do not change lightly):
 *   1) Add incoming supply quantities (and create new SKUs if needed)
 *   2) Subtract sold quantities (never go below zero)
 *
 * MAINTENANCE: This function does not write files. The API route that calls it
 * is responsible for saving the updated list back to data/inventory/inventory.json.
 */
export function applyInventoryUpdates(
  inventory: InventoryItem[],
  sales: SalesItem[],
  incoming: IncomingItem[]
): InventoryItem[] {
  // Work on a clone so we never accidentally mutate the original array in memory.
  const bySku = new Map<string, InventoryItem>();
  for (const item of inventory) {
    bySku.set(item.sku, { ...item });
  }

  // --- Step 1: add incoming supplies ---
  for (const shipment of incoming) {
    const existing = bySku.get(shipment.sku);
    if (existing) {
      existing.quantity += shipment.quantityReceived;
      // Prefer the newer lot expiration when the shipment provides one.
      if (shipment.expiration) {
        existing.expiration = shipment.expiration;
      }
      if (shipment.name) existing.name = shipment.name;
    } else {
      // Brand-new SKU arriving for the first time — fill sensible defaults.
      bySku.set(shipment.sku, {
        sku: shipment.sku,
        name: shipment.name ?? shipment.sku,
        quantity: shipment.quantityReceived,
        expiration: shipment.expiration ?? "2099-12-31",
        rateOfSale: shipment.rateOfSale ?? 0,
        storageRequirements: shipment.storageRequirements ?? "Unspecified — update in inventory JSON",
        reorderThreshold: shipment.reorderThreshold ?? DEFAULT_REORDER_THRESHOLD,
        overstockThreshold: shipment.overstockThreshold ?? DEFAULT_OVERSTOCK_THRESHOLD,
      });
    }
  }

  // --- Step 2: subtract sales ---
  for (const sale of sales) {
    const existing = bySku.get(sale.sku);
    if (!existing) {
      // Sale for an unknown SKU — skip rather than invent a negative product.
      continue;
    }
    existing.quantity = Math.max(0, existing.quantity - sale.quantitySold);
  }

  return Array.from(bySku.values()).sort((a, b) => a.sku.localeCompare(b.sku));
}

/* -------------------------------------------------------------------------- */
/* CURATED REPORT                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Builds the curated inventory report shown after clicking "Generate report".
 *
 * Today this uses rule-based "AI-style" cross-checks (trends + thresholds).
 * FUTURE: This is the place to plug in a real AI model that reviews trends,
 * shelf life, and reorder suggestions — keep the StockReport return shape stable
 * so the webpage does not need a redesign.
 */
export function generateStockReport(items: InventoryItem[], now: Date = new Date()): StockReport {
  const alerts = buildAlerts(items, now);

  const lines: StockLine[] = items.map((item) => ({
    ...item,
    status: classifyStatus(item, now),
    daysUntilExpiration: daysUntil(item.expiration, now),
  }));

  const totals = {
    itemCount: lines.length,
    totalUnits: lines.reduce((sum, l) => sum + l.quantity, 0),
    outOfStockCount: lines.filter((l) => l.status === "out_of_stock").length,
    understockedCount: lines.filter((l) => l.status === "understocked").length,
    overstockedCount: lines.filter((l) => l.status === "overstocked").length,
    expiringSoonCount: lines.filter((l) => l.status === "expiring_soon").length,
    expiredCount: lines.filter((l) => l.status === "expired").length,
    healthyCount: lines.filter((l) => l.status === "healthy").length,
  };

  const recommendations = buildRecommendations(lines, alerts);

  const summary = [
    `Reviewed ${totals.itemCount} SKUs (${totals.totalUnits.toLocaleString()} total units).`,
    totals.outOfStockCount > 0
      ? `${totals.outOfStockCount} out of stock.`
      : "No out-of-stock items.",
    totals.expiringSoonCount + totals.expiredCount > 0
      ? `${totals.expiringSoonCount} expiring soon / ${totals.expiredCount} expired — act on perishables first.`
      : "No immediate expiration risk.",
    totals.understockedCount > 0
      ? `${totals.understockedCount} under the reorder line.`
      : "Reorder lines are currently covered.",
  ].join(" ");

  return {
    generatedAt: now.toISOString(),
    summary,
    recommendations,
    totals,
    lines,
    alerts,
  };
}

/**
 * Plain-language action list for the operations manager.
 * Keep wording short — these appear as bullets under the report.
 */
function buildRecommendations(lines: StockLine[], alerts: InventoryAlert[]): string[] {
  const tips: string[] = [];

  const expired = lines.filter((l) => l.status === "expired");
  if (expired.length > 0) {
    tips.push(
      `Remove or markdown expired stock: ${expired.map((l) => l.sku).join(", ")}.`
    );
  }

  const expiring = lines.filter((l) => l.status === "expiring_soon");
  if (expiring.length > 0) {
    tips.push(
      `Push promotions or rotate forward for: ${expiring.map((l) => `${l.name} (${l.daysUntilExpiration}d)`).join("; ")}.`
    );
  }

  const needReorder = lines.filter(
    (l) => l.status === "out_of_stock" || l.status === "understocked"
  );
  if (needReorder.length > 0) {
    tips.push(
      `Contact suppliers to restock: ${needReorder
        .map((l) => `${l.sku} (on hand ${l.quantity}, threshold ${l.reorderThreshold})`)
        .join("; ")}.`
    );
  }

  const overstocked = lines.filter((l) => l.status === "overstocked");
  if (overstocked.length > 0) {
    tips.push(
      `Reduce overstock / pause POs for: ${overstocked.map((l) => l.sku).join(", ")}.`
    );
  }

  // Trend note: products selling faster than remaining shelf life allows.
  const velocityRisk = lines.filter((l) => {
    if (l.rateOfSale <= 0 || l.daysUntilExpiration <= 0) return false;
    const daysOfCover = l.quantity / l.rateOfSale;
    return daysOfCover > l.daysUntilExpiration && l.quantity > 0;
  });
  if (velocityRisk.length > 0) {
    tips.push(
      `Rate-of-sale vs shelf life risk (more stock than can sell before expiry): ${velocityRisk
        .map((l) => l.sku)
        .join(", ")}.`
    );
  }

  if (tips.length === 0) {
    tips.push("Inventory looks balanced — no urgent supplier outreach required today.");
  }

  // Soft cap so the UI stays readable; full alerts remain available separately.
  if (alerts.length > 12) {
    tips.push(`There are ${alerts.length} active alerts — review the alert cards above for full detail.`);
  }

  return tips;
}

/**
 * Filters inventory rows for the search box and status filter on the main page.
 * Safe to call on every keystroke — it does not change the source data.
 */
export function filterInventory(
  items: InventoryItem[],
  search: string,
  statusFilter: "all" | StockStatus,
  now: Date = new Date()
): InventoryItem[] {
  const q = search.trim().toLowerCase();
  return items.filter((item) => {
    const status = classifyStatus(item, now);
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (!q) return true;
    return (
      item.sku.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.storageRequirements.toLowerCase().includes(q)
    );
  });
}
