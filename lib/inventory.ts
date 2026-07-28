/**
 * ============================================================================
 * INVENTORY CORE LOGIC (lib/inventory.ts)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * This file holds the shared "brain" of the inventory tool. It does NOT talk to the
 * browser, the network, or the data file by itself. Instead, the web pages and API
 * routes call these helpers to:
 *   1) Describe what an inventory row looks like (one batch of a dairy product)
 *   2) Work out the stock status of a batch (out of stock, expiring soon, …)
 *   3) Build alert badges for the top of the monitoring page
 *   4) Apply sales (−) and incoming supplies (+) to stock levels
 *   5) Build a curated stock report for the operations manager
 *
 * WHERE THE DATA COMES FROM:
 * data/inventory/inventory.csv — a real dairy dataset. One line per product batch.
 * The columns used by this app are:
 *   Product ID, Product Name, Brand, Quantity (liters/kg),
 *   Quantity Sold (liters/kg), Quantity in Stock (liters/kg), Storage Condition,
 *   Expiration Date, Date, Shelf Life (days),
 *   Minimum Stock Threshold (liters/kg), Reorder Quantity (liters/kg)
 * The mapping from those column names to the fields below lives in lib/data-store.ts.
 *
 * HOW TO MAINTAIN (non-technical notes):
 * - Alert rules (how many days before expiration counts as "expiring soon", how
 *   much stock counts as overstocked) live in the ALERT SETTINGS section below.
 *   Change those numbers carefully — everything else follows from them.
 * - If you add a new column to the CSV and want to show it, add a field to
 *   InventoryItem here AND map it in lib/data-store.ts.
 * - Do not delete functions that are imported by app/api/* — the pages rely on them.
 * ============================================================================
 */

/* -------------------------------------------------------------------------- */
/* ALERT SETTINGS — tweak these numbers when business rules change            */
/* -------------------------------------------------------------------------- */

/** How many days before the expiration date we start warning the coordinator. */
export const EXPIRING_SOON_DAYS = 5;

/** Minimum stock level used when the CSV row leaves that column empty. */
export const DEFAULT_MINIMUM_STOCK_THRESHOLD = 50;

/** Reorder amount used when the CSV row leaves that column empty. */
export const DEFAULT_REORDER_QUANTITY = 100;

/**
 * How much stock counts as "overstocked".
 * A batch is flagged when what is left on hand reaches
 *   minimum stock threshold + (this number × reorder quantity).
 * Example with the default of 3: a product whose minimum is 50 and whose reorder
 * amount is 100 is flagged as overstocked once 350 units are still sitting in stock.
 */
export const OVERSTOCK_REORDER_MULTIPLE = 3;

/**
 * WHICH DAY COUNTS AS "TODAY" FOR SHELF LIFE.
 *
 * The dataset is a historical export: every batch was recorded on its own date
 * (the CSV "Date" column) and most expiration dates are long past by now. Judging
 * those batches against the real calendar would simply mark all of them expired,
 * which tells a coordinator nothing.
 *
 * - "record_date" (default): each batch is judged against the day it was recorded,
 *   so the Status column shows the mix of healthy / expiring / expired batches the
 *   dataset actually describes.
 * - "today": judge every batch against the real calendar date. Switch to this once
 *   the CSV is fed by a live, up-to-date export.
 */
export const SHELF_LIFE_REFERENCE: "record_date" | "today" = "record_date";

/* -------------------------------------------------------------------------- */
/* DATA SHAPES — these match the columns in data/inventory/inventory.csv       */
/* -------------------------------------------------------------------------- */

/**
 * One batch of a dairy product from data/inventory/inventory.csv.
 * The CSV holds many batches per product, so Product ID repeats across rows.
 */
export type InventoryItem = {
  /**
   * Unique key for this single CSV line (for example "P1-L42").
   * Used by the web page to tell rows apart and by the save routine to find the
   * right line again. It is never shown to the user.
   */
  rowId: string;
  /** Which data line of the CSV this batch came from (1 = first line after the header). */
  lineNumber: number;
  /** CSV "Product ID" — the product code shown in the first table column. */
  productId: string;
  /** CSV "Product Name", for example "Milk". */
  productName: string;
  /** CSV "Brand", for example "Amul". */
  brand: string;
  /** Display name shown in the Name column: brand followed by product name. */
  name: string;
  /** CSV "Quantity (liters/kg)" — how much of this batch was produced / received. */
  quantity: number;
  /** CSV "Quantity Sold (liters/kg)" — how much of the batch has already sold. */
  quantitySold: number;
  /** CSV "Quantity in Stock (liters/kg)" — what is left on hand (quantity − sold). */
  quantityInStock: number;
  /** CSV "Storage Condition", for example "Refrigerated". */
  storageCondition: string;
  /** CSV "Expiration Date" as YYYY-MM-DD. */
  expirationDate: string;
  /** CSV "Date" — the day this batch was recorded (its snapshot date). */
  recordDate: string;
  /** CSV "Shelf Life (days)" — how long the batch stays sellable after production. */
  shelfLifeDays: number;
  /** CSV "Minimum Stock Threshold (liters/kg)" — restock at or below this level. */
  minimumStockThreshold: number;
  /** CSV "Reorder Quantity (liters/kg)" — how much is normally reordered. */
  reorderQuantity: number;
};

/**
 * One sales line from the sales department feed.
 * The feed shown by /api/sales is derived from the "Quantity Sold (liters/kg)"
 * column of the inventory CSV.
 */
export type SalesItem = {
  productId: string;
  name: string;
  /** Units sold that should be taken out of stock. */
  quantitySold: number;
};

/**
 * One incoming supply line from warehousing / receiving.
 * The feed shown by /api/incoming is derived from the batch columns of the
 * inventory CSV (quantity, expiration date, storage condition).
 */
export type IncomingItem = {
  productId: string;
  name: string;
  /** Units received, which arrive as a brand-new batch. */
  quantity: number;
  /** Expiration date of the arriving batch, YYYY-MM-DD. */
  expirationDate: string;
  /** How the arriving batch must be stored. */
  storageCondition: string;
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
  /** Product code the alert belongs to (CSV "Product ID"). */
  productId: string;
  /** Brand + product name, so the alert reads well on its own. */
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

/** Turns a YYYY-MM-DD text value into a real date, or null when it is unusable. */
function toDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Counts whole days between two dates (later minus earlier).
 * Negative numbers mean the first date is already in the past.
 */
function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toMidnight.getTime() - fromMidnight.getTime()) / msPerDay);
}

/**
 * Which day a batch is measured against — see SHELF_LIFE_REFERENCE at the top.
 * Falls back to the real date whenever the CSV row has no usable record date.
 */
export function shelfLifeReferenceDate(item: InventoryItem, now: Date = new Date()): Date {
  if (SHELF_LIFE_REFERENCE === "today") return now;
  return toDate(item.recordDate) ?? now;
}

/**
 * How many days of shelf life a batch has left.
 * Zero or more means still sellable; a negative number means already expired.
 * Batches without a readable expiration date are treated as "plenty of time left"
 * so that a blank cell never raises a false expiry alarm.
 */
export function daysUntilExpiration(item: InventoryItem, now: Date = new Date()): number {
  const expiration = toDate(item.expirationDate);
  if (!expiration) return Number.POSITIVE_INFINITY;
  return daysBetween(shelfLifeReferenceDate(item, now), expiration);
}

/* -------------------------------------------------------------------------- */
/* STOCK LEVEL HELPERS                                                        */
/* -------------------------------------------------------------------------- */

/**
 * How much of a batch is still on hand.
 * The dataset provides this as "Quantity in Stock (liters/kg)"; when that cell is
 * missing we fall back to the two columns shown in the table
 * (Quantity − Quantity Sold), which is the same figure.
 */
export function unitsOnHand(item: InventoryItem): number {
  const inStock = Number.isFinite(item.quantityInStock) ? item.quantityInStock : NaN;
  const fallback = item.quantity - item.quantitySold;
  const value = Number.isNaN(inStock) ? fallback : inStock;
  return Math.max(0, value);
}

/** Restock level for a batch, using the shared default when the CSV cell is empty. */
export function minimumStockLevel(item: InventoryItem): number {
  return item.minimumStockThreshold > 0
    ? item.minimumStockThreshold
    : DEFAULT_MINIMUM_STOCK_THRESHOLD;
}

/** The level at which a batch counts as overstocked (see OVERSTOCK_REORDER_MULTIPLE). */
export function overstockLevel(item: InventoryItem): number {
  const reorder = item.reorderQuantity > 0 ? item.reorderQuantity : DEFAULT_REORDER_QUANTITY;
  return minimumStockLevel(item) + OVERSTOCK_REORDER_MULTIPLE * reorder;
}

/* -------------------------------------------------------------------------- */
/* STATUS + ALERTS                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Picks the single most urgent status for a batch — this is what the Status
 * column on the page shows.
 *
 * Priority order (worst first): expired → out of stock → expiring soon →
 * understocked → overstocked → healthy.
 *
 * MAINTENANCE: If operations wants a different priority (for example understocked
 * before expiring soon), reorder the if-statements below.
 */
export function classifyStatus(item: InventoryItem, now: Date = new Date()): StockStatus {
  const days = daysUntilExpiration(item, now);
  const onHand = unitsOnHand(item);

  if (days < 0) return "expired";
  if (onHand <= 0) return "out_of_stock";
  if (days <= EXPIRING_SOON_DAYS) return "expiring_soon";
  if (onHand <= minimumStockLevel(item)) return "understocked";
  if (onHand >= overstockLevel(item)) return "overstocked";
  return "healthy";
}

/** Rounds a stock figure to one decimal so messages stay readable. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Builds the alert list behind the badges at the top of the monitoring page.
 * One batch can produce more than one alert (for example low stock AND expiring soon).
 */
export function buildAlerts(items: InventoryItem[], now: Date = new Date()): InventoryAlert[] {
  const alerts: InventoryAlert[] = [];

  for (const item of items) {
    const days = daysUntilExpiration(item, now);
    const onHand = unitsOnHand(item);
    const minimum = minimumStockLevel(item);
    const overstock = overstockLevel(item);

    if (days < 0) {
      alerts.push({
        kind: "expired",
        productId: item.productId,
        name: item.name,
        message: `Expired ${Math.abs(days)} day(s) ago — remove or markdown.`,
      });
    } else if (days <= EXPIRING_SOON_DAYS) {
      alerts.push({
        kind: "expiring_soon",
        productId: item.productId,
        name: item.name,
        message: `Expires in ${days} day(s) — prioritize sale or transfer.`,
      });
    }

    if (onHand <= 0) {
      alerts.push({
        kind: "out_of_stock",
        productId: item.productId,
        name: item.name,
        message: "Sold out — lost sales risk until the next batch arrives.",
      });
    } else if (onHand <= minimum) {
      alerts.push({
        kind: "understocked",
        productId: item.productId,
        name: item.name,
        message: `Only ${round1(onHand)} left (restock at ${round1(minimum)}).`,
      });
    } else if (onHand >= overstock) {
      alerts.push({
        kind: "overstocked",
        productId: item.productId,
        name: item.name,
        message: `${round1(onHand)} still in stock, above the overstock limit of ${round1(overstock)}.`,
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
 * Applies incoming supplies and sales to a copy of the current batch list.
 *
 * ORDER OF OPERATIONS (do not change lightly):
 *   1) Incoming supplies arrive as brand-new batch rows, because every delivery
 *      has its own expiration date and storage condition.
 *   2) Sales are taken out of the oldest batch of that product first (the usual
 *      "first expired, first out" rule for perishable dairy), never below zero.
 *
 * MAINTENANCE: This function does not write files. The API route that calls it is
 * responsible for saving the result back to data/inventory/inventory.csv.
 */
export function applyInventoryUpdates(
  inventory: InventoryItem[],
  sales: SalesItem[],
  incoming: IncomingItem[]
): InventoryItem[] {
  // Work on copies so we never accidentally change the original list in memory.
  const batches: InventoryItem[] = inventory.map((item) => ({ ...item }));

  // --- Step 1: add incoming supplies as new batches ---
  incoming.forEach((delivery, index) => {
    batches.push({
      rowId: `new-${index + 1}`,
      // 0 means "not in the file yet" — the save routine appends these lines.
      lineNumber: 0,
      productId: delivery.productId,
      productName: delivery.name || delivery.productId,
      brand: "",
      name: delivery.name || delivery.productId,
      quantity: delivery.quantity,
      quantitySold: 0,
      quantityInStock: delivery.quantity,
      storageCondition: delivery.storageCondition || "Unspecified",
      expirationDate: delivery.expirationDate || "",
      recordDate: new Date().toISOString().slice(0, 10),
      shelfLifeDays: 0,
      minimumStockThreshold: DEFAULT_MINIMUM_STOCK_THRESHOLD,
      reorderQuantity: DEFAULT_REORDER_QUANTITY,
    });
  });

  // --- Step 2: subtract sales, oldest expiration date first ---
  for (const sale of sales) {
    const productBatches = batches
      .filter((batch) => batch.productId === sale.productId)
      .sort((a, b) => a.expirationDate.localeCompare(b.expirationDate));

    let remaining = sale.quantitySold;
    for (const batch of productBatches) {
      if (remaining <= 0) break;
      const available = unitsOnHand(batch);
      const taken = Math.min(available, remaining);
      batch.quantityInStock = available - taken;
      batch.quantitySold += taken;
      remaining -= taken;
    }
    // Anything left over is a sale for stock we do not have on record — ignored
    // on purpose, so quantities never go negative.
  }

  return batches;
}

/* -------------------------------------------------------------------------- */
/* CURATED REPORT                                                             */
/* -------------------------------------------------------------------------- */

/** How urgent each status is, so the report can list the worst batches first. */
const STATUS_PRIORITY: Record<StockStatus, number> = {
  expired: 0,
  out_of_stock: 1,
  expiring_soon: 2,
  understocked: 3,
  overstocked: 4,
  healthy: 5,
};

/**
 * Builds the curated inventory report shown after clicking "Generate report".
 * Batches are returned worst-status-first so the top of the list is the work queue.
 *
 * Today this uses rule-based cross-checks (shelf life + stock thresholds).
 * FUTURE: This is the place to plug in a real AI model that reviews trends,
 * shelf life, and reorder suggestions — keep the StockReport return shape stable
 * so the webpage does not need a redesign.
 */
export function generateStockReport(items: InventoryItem[], now: Date = new Date()): StockReport {
  const alerts = buildAlerts(items, now);

  const lines: StockLine[] = items
    .map((item) => {
      const days = daysUntilExpiration(item, now);
      return {
        ...item,
        status: classifyStatus(item, now),
        // Infinity cannot travel through JSON, so a missing expiration date is
        // reported as a large but real number of days.
        daysUntilExpiration: Number.isFinite(days) ? days : 9999,
      };
    })
    .sort(
      (a, b) =>
        STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] ||
        a.daysUntilExpiration - b.daysUntilExpiration
    );

  const totals = {
    itemCount: lines.length,
    totalUnits: Math.round(lines.reduce((sum, line) => sum + unitsOnHand(line), 0)),
    outOfStockCount: lines.filter((l) => l.status === "out_of_stock").length,
    understockedCount: lines.filter((l) => l.status === "understocked").length,
    overstockedCount: lines.filter((l) => l.status === "overstocked").length,
    expiringSoonCount: lines.filter((l) => l.status === "expiring_soon").length,
    expiredCount: lines.filter((l) => l.status === "expired").length,
    healthyCount: lines.filter((l) => l.status === "healthy").length,
  };

  const recommendations = buildRecommendations(lines, alerts);

  const summary = [
    `Reviewed ${totals.itemCount.toLocaleString()} product batches (${totals.totalUnits.toLocaleString()} units still in stock).`,
    totals.outOfStockCount > 0
      ? `${totals.outOfStockCount} sold out.`
      : "No sold-out batches.",
    totals.expiringSoonCount + totals.expiredCount > 0
      ? `${totals.expiringSoonCount} expiring soon / ${totals.expiredCount} expired — act on perishables first.`
      : "No immediate expiration risk.",
    totals.understockedCount > 0
      ? `${totals.understockedCount} under the minimum stock level.`
      : "Minimum stock levels are currently covered.",
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
 * Joins a few example names into a readable sentence fragment.
 * With thousands of batches a full list would be unreadable, so only the first
 * few are named and the rest are summarised as "+N more".
 */
function listSample(values: string[], limit = 6): string {
  const shown = values.slice(0, limit).join("; ");
  const hidden = values.length - limit;
  return hidden > 0 ? `${shown}; +${hidden} more` : shown;
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
      `Remove or markdown ${expired.length} expired batch(es): ${listSample(
        expired.map((l) => `${l.name} (product ${l.productId})`)
      )}.`
    );
  }

  const expiring = lines.filter((l) => l.status === "expiring_soon");
  if (expiring.length > 0) {
    tips.push(
      `Push promotions or rotate forward ${expiring.length} batch(es): ${listSample(
        expiring.map((l) => `${l.name} (${l.daysUntilExpiration}d left)`)
      )}.`
    );
  }

  const needReorder = lines.filter(
    (l) => l.status === "out_of_stock" || l.status === "understocked"
  );
  if (needReorder.length > 0) {
    tips.push(
      `Contact suppliers to restock ${needReorder.length} batch(es): ${listSample(
        needReorder.map(
          (l) => `${l.name} (on hand ${round1(unitsOnHand(l))}, minimum ${round1(minimumStockLevel(l))})`
        )
      )}.`
    );
  }

  const overstocked = lines.filter((l) => l.status === "overstocked");
  if (overstocked.length > 0) {
    tips.push(
      `Slow down orders for ${overstocked.length} overstocked batch(es): ${listSample(
        overstocked.map((l) => `${l.name} (product ${l.productId})`)
      )}.`
    );
  }

  // Trend note: batches holding more stock than they can realistically sell
  // before their expiration date, based on how fast the batch has sold so far.
  const velocityRisk = lines.filter((l) => {
    if (l.status === "expired" || l.daysUntilExpiration <= 0) return false;
    const onHand = unitsOnHand(l);
    if (onHand <= 0 || l.quantitySold <= 0) return false;
    const soldPerDay = l.quantitySold / Math.max(1, l.shelfLifeDays);
    return soldPerDay > 0 && onHand / soldPerDay > l.daysUntilExpiration;
  });
  if (velocityRisk.length > 0) {
    tips.push(
      `Selling too slowly to clear before expiry — ${velocityRisk.length} batch(es): ${listSample(
        velocityRisk.map((l) => `${l.name} (product ${l.productId})`)
      )}.`
    );
  }

  if (tips.length === 0) {
    tips.push("Inventory looks balanced — no urgent supplier outreach required today.");
  }

  // Soft cap so the UI stays readable; full alert counts remain on the cards above.
  if (alerts.length > 12) {
    tips.push(
      `There are ${alerts.length.toLocaleString()} active alerts — review the alert cards above for the full picture.`
    );
  }

  return tips;
}

/**
 * Filters batches for the search box and status filter on the main page.
 * Searches product id, name (brand + product), and storage condition.
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
    if (statusFilter !== "all" && classifyStatus(item, now) !== statusFilter) return false;
    if (!q) return true;
    return (
      item.productId.toLowerCase().includes(q) ||
      item.name.toLowerCase().includes(q) ||
      item.storageCondition.toLowerCase().includes(q)
    );
  });
}
