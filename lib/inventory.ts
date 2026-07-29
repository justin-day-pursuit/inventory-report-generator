/**
 * ============================================================================
 * INVENTORY CORE LOGIC (lib/inventory.ts)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Shared "brain" for the inventory coordinator tool. It does not talk to the
 * browser or the network. Pages and API routes call these helpers to:
 *   1) Describe what one inventory BATCH looks like
 *   2) Work out expiration status and stock status for that batch
 *   3) Build alert badges and "needs action" filters for the morning review
 *   4) Apply sales (−) and incoming supplies (+) when those feeds are re-enabled
 *   5) Build a curated stock report for the operations manager
 *
 * HOW A BATCH IS IDENTIFIED:
 * A batch is one unique combination of:
 *   Location + Product Name + Brand + Storage Condition + Sales Channel
 * Brand + Product Name is the human-readable name shown in the list
 * (for example "Amul Milk"). The CSV's "Product ID" is NOT used as an identifier —
 * every brand of a product shares the same id.
 *
 * HOW NUMBERS ARE COMBINED (done in lib/data-store.ts, used here as-is):
 *   Quantity / Minimum Stock Threshold / Reorder Quantity / money totals
 *     → sum of the CSV lines in the batch
 *   Expiration date
 *     → earliest of (Expiration Date) and (Production Date + Shelf Life days)
 *       across every line in the batch
 *   Customer locations
 *     → running list of the distinct Customer Location values in the batch
 * Quantity Sold and Quantity in Stock are intentionally ignored for status math.
 *
 * HOW TO MAINTAIN:
 * - Alert / filter windows (days to expiry, overstock multiple, test "today")
 *   live in the SETTINGS section below — change those carefully.
 * - Do not delete functions imported by app/api/* — the pages rely on them.
 * ============================================================================
 */

/* -------------------------------------------------------------------------- */
/* SETTINGS — tweak these when business rules or the test calendar change     */
/* -------------------------------------------------------------------------- */

/**
 * Fake "today" used for every shelf-life and status calculation.
 *
 * WHY: the dairy CSV is a historical export (expiration dates run 2018–2023).
 * Judging those dates against the real calendar would mark almost everything
 * expired. This constant is set close to the earliest Expiration Date in the
 * file (2018-11-14) so the coordinator view can be tested with a realistic mix
 * of expired / expiring-soon / still-good batches.
 *
 * MAINTENANCE: Move this forward when you want to re-test against a later slice
 * of the dataset, or switch STATUS_CLOCK to "real_today" for a live feed.
 */
export const APP_REFERENCE_DATE = "2018-11-20";

/**
 * Which clock to use when measuring shelf life and stock status.
 * - "app_reference_date" (default): use APP_REFERENCE_DATE above.
 * - "real_today": use the computer's real calendar date (for live exports).
 */
export const STATUS_CLOCK: "app_reference_date" | "real_today" = "app_reference_date";

/**
 * How many days ahead of expiration counts as "expiring soon".
 * Matches the coordinator habit of checking anything coming up in the next
 * two weeks every morning.
 */
export const EXPIRING_SOON_DAYS = 14;

/** Fallback minimum stock level when a batch somehow has no threshold. */
export const DEFAULT_MINIMUM_STOCK_THRESHOLD = 50;

/** Fallback reorder amount when a batch somehow has no reorder quantity. */
export const DEFAULT_REORDER_QUANTITY = 100;

/**
 * How much stock counts as overstocked.
 * A batch is overstocked when:
 *   quantity >= minimumStockThreshold + (this × reorderQuantity)
 * Raise this number to flag fewer overstocked batches; lower it to flag more.
 */
export const OVERSTOCK_REORDER_MULTIPLE = 5;

/* -------------------------------------------------------------------------- */
/* DATA SHAPES                                                                */
/* -------------------------------------------------------------------------- */

/**
 * One inventory BATCH shown in the coordinator list.
 * Built by grouping CSV lines that share the same location, product name, brand,
 * storage condition and sales channel (see lib/data-store.ts).
 */
export type InventoryItem = {
  /**
   * Stable key for this batch — location|product|brand|storage|channel.
   * Used by React lists and by the save routine; not shown as its own column.
   */
  batchKey: string;
  /** CSV data-line number of the newest source row (1 = first data line). */
  lineNumber: number;
  /** How many CSV lines were rolled into this batch. */
  sourceRowCount: number;
  /** Raw CSV "Product ID" from the newest source row — preserved on write only. */
  csvProductId: string;
  /** CSV "Product Name", for example "Milk". */
  productName: string;
  /** CSV "Brand", for example "Amul". */
  brand: string;
  /** Display name: Brand + Product Name, for example "Amul Milk". */
  name: string;
  /** CSV "Location" — dairy farm / supply geography for this batch. */
  location: string;
  /** CSV "Sales Channel" — Retail, Wholesale, or Online. */
  salesChannel: string;
  /** CSV "Storage Condition", for example "Refrigerated". */
  storageCondition: string;
  /**
   * Sum of "Quantity (liters/kg)" across the batch.
   * This is the on-hand figure used for stock-status math (Quantity Sold and
   * Quantity in Stock are ignored on purpose for now).
   */
  quantity: number;
  /** Sum of "Minimum Stock Threshold (liters/kg)" across the batch. */
  minimumStockThreshold: number;
  /** Sum of "Reorder Quantity (liters/kg)" across the batch. */
  reorderQuantity: number;
  /**
   * Effective expiration date for the batch (YYYY-MM-DD): the earliest date
   * among every source row's min(Expiration Date, Production Date + Shelf Life).
   */
  expirationDate: string;
  /** Sum of "Total Value" across the batch (informational). */
  totalValue: number;
  /** Sum of "Approx. Total Revenue(INR)" across the batch (informational). */
  approxTotalRevenue: number;
  /**
   * Quantity-weighted average of "Price per Unit" across the batch
   * (summing unit prices would be meaningless, so we average them).
   */
  pricePerUnit: number;
  /**
   * Running list of distinct "Customer Location" values seen in the batch.
   * Location itself is part of the batch key, so it stays a single value;
   * customer locations can differ across the lines that rolled together.
   */
  customerLocations: string[];
  /** Newest CSV "Date" among the source rows (snapshot / recording date). */
  recordDate: string;
};

/**
 * Sales feed row. Matched to a batch by brand + product name.
 * Quantity sold is accepted for future update flows but is not used in status math.
 */
export type SalesItem = {
  name: string;
  quantitySold: number;
};

/** Incoming supply feed row. Matched to a batch by brand + product name. */
export type IncomingItem = {
  name: string;
  quantity: number;
  expirationDate: string;
  storageCondition: string;
  location?: string;
  salesChannel?: string;
};

/** Shelf-life outcome for the Expiration Status column. */
export type ExpirationStatus = "expired" | "expiring_soon" | "ok";

/** Stock-level outcome for the Stock Status column. */
export type StockStatus =
  | "out_of_stock"
  | "understocked"
  | "overstocked"
  | "healthy";

/**
 * Combined attention flag used by the morning "Needs action" filter.
 * A batch needs action when either its shelf life or its stock level is unhealthy.
 */
export type ActionFilter =
  | "needs_action"
  | "expired"
  | "expiring_soon"
  | "out_of_stock"
  | "understocked"
  | "overstocked"
  | "healthy"
  | "all";

export type AlertKind =
  | "out_of_stock"
  | "understocked"
  | "overstocked"
  | "expiring_soon"
  | "expired";

export type InventoryAlert = {
  kind: AlertKind;
  name: string;
  location: string;
  message: string;
};

export type StockLine = InventoryItem & {
  expirationStatus: ExpirationStatus;
  stockStatus: StockStatus;
  daysUntilExpiration: number;
  needsAction: boolean;
};

export type StockReport = {
  generatedAt: string;
  referenceDate: string;
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
    needsActionCount: number;
  };
  lines: StockLine[];
  alerts: InventoryAlert[];
};

/* -------------------------------------------------------------------------- */
/* DATE HELPERS                                                               */
/* -------------------------------------------------------------------------- */

/** Turns a YYYY-MM-DD string into a Date at local midnight, or null if unusable. */
function toDate(value: string): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Whole days between two calendar dates (later − earlier). */
function daysBetween(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

/**
 * The "today" the rest of the status helpers measure against.
 * Honours STATUS_CLOCK / APP_REFERENCE_DATE so tests stay reproducible.
 */
export function appToday(now: Date = new Date()): Date {
  if (STATUS_CLOCK === "real_today") return now;
  return toDate(APP_REFERENCE_DATE) ?? now;
}

/**
 * How many days of shelf life a batch still has, measured from appToday().
 * Negative = already expired. Missing dates are treated as "far in the future"
 * so a blank cell never raises a false expiry alarm.
 */
export function daysUntilExpiration(item: InventoryItem, now: Date = new Date()): number {
  const expiration = toDate(item.expirationDate);
  if (!expiration) return Number.POSITIVE_INFINITY;
  return daysBetween(appToday(now), expiration);
}

/* -------------------------------------------------------------------------- */
/* STATUS HELPERS                                                             */
/* -------------------------------------------------------------------------- */

/** Restock floor for a batch (summed threshold, with a safe default). */
export function minimumStockLevel(item: InventoryItem): number {
  return item.minimumStockThreshold > 0
    ? item.minimumStockThreshold
    : DEFAULT_MINIMUM_STOCK_THRESHOLD;
}

/** Level at which a batch counts as overstocked. */
export function overstockLevel(item: InventoryItem): number {
  const reorder = item.reorderQuantity > 0 ? item.reorderQuantity : DEFAULT_REORDER_QUANTITY;
  return minimumStockLevel(item) + OVERSTOCK_REORDER_MULTIPLE * reorder;
}

/**
 * Expiration Status column — only looks at the batch's effective expiration date.
 * Does not consider stock quantity.
 */
export function classifyExpirationStatus(
  item: InventoryItem,
  now: Date = new Date()
): ExpirationStatus {
  const days = daysUntilExpiration(item, now);
  if (days < 0) return "expired";
  if (days <= EXPIRING_SOON_DAYS) return "expiring_soon";
  return "ok";
}

/**
 * Stock Status column — only looks at Quantity vs the summed thresholds.
 * Quantity Sold and Quantity in Stock are ignored (see file header).
 */
export function classifyStockStatus(item: InventoryItem): StockStatus {
  const onHand = item.quantity;
  if (onHand <= 0) return "out_of_stock";
  if (onHand <= minimumStockLevel(item)) return "understocked";
  if (onHand >= overstockLevel(item)) return "overstocked";
  return "healthy";
}

/**
 * True when a coordinator should act today: shelf-life risk and/or stock-level risk
 * that can lead to a stockout. Overstocked alone is tracked separately so the
 * default morning list stays focused on the preventable failures (stockouts + waste).
 */
export function needsAction(item: InventoryItem, now: Date = new Date()): boolean {
  const expiration = classifyExpirationStatus(item, now);
  const stock = classifyStockStatus(item);
  return (
    expiration === "expired" ||
    expiration === "expiring_soon" ||
    stock === "out_of_stock" ||
    stock === "understocked"
  );
}

/**
 * Combined single status kept for older call sites / report chips that expect
 * one label. Prefer classifyExpirationStatus + classifyStockStatus for new UI.
 * Priority: expired → out of stock → expiring soon → understocked → overstocked → healthy.
 */
export function classifyStatus(
  item: InventoryItem,
  now: Date = new Date()
): ExpirationStatus | StockStatus | "healthy" {
  const expiration = classifyExpirationStatus(item, now);
  if (expiration === "expired") return "expired";
  const stock = classifyStockStatus(item);
  if (stock === "out_of_stock") return "out_of_stock";
  if (expiration === "expiring_soon") return "expiring_soon";
  if (stock === "understocked") return "understocked";
  if (stock === "overstocked") return "overstocked";
  return "healthy";
}

/** Rounds a stock figure to one decimal so alert text stays readable. */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Builds the alert list behind the top summary cards.
 * One batch can produce more than one alert (for example low stock AND expiring).
 */
export function buildAlerts(items: InventoryItem[], now: Date = new Date()): InventoryAlert[] {
  const alerts: InventoryAlert[] = [];

  for (const item of items) {
    const days = daysUntilExpiration(item, now);
    const onHand = item.quantity;
    const minimum = minimumStockLevel(item);
    const overstock = overstockLevel(item);

    if (days < 0) {
      alerts.push({
        kind: "expired",
        name: item.name,
        location: item.location,
        message: `Expired ${Math.abs(days)} day(s) ago at ${item.location} — remove or markdown.`,
      });
    } else if (days <= EXPIRING_SOON_DAYS) {
      alerts.push({
        kind: "expiring_soon",
        name: item.name,
        location: item.location,
        message: `Expires in ${days} day(s) at ${item.location} (${item.salesChannel}) — prioritize sale or transfer.`,
      });
    }

    if (onHand <= 0) {
      alerts.push({
        kind: "out_of_stock",
        name: item.name,
        location: item.location,
        message: `Sold out at ${item.location} — reorder ${round1(item.reorderQuantity || DEFAULT_REORDER_QUANTITY)}.`,
      });
    } else if (onHand <= minimum) {
      alerts.push({
        kind: "understocked",
        name: item.name,
        location: item.location,
        message: `Only ${round1(onHand)} left at ${item.location} (reorder at ${round1(minimum)}; suggested ${round1(item.reorderQuantity)}).`,
      });
    } else if (onHand >= overstock) {
      alerts.push({
        kind: "overstocked",
        name: item.name,
        location: item.location,
        message: `${round1(onHand)} on hand at ${item.location} is above the overstock line of ${round1(overstock)}.`,
      });
    }
  }

  return alerts;
}

/**
 * Counts how many BATCHES fall into each status for the top summary badges.
 *
 * WHY BATCHES (not alert messages):
 * One batch can raise more than one alert (for example understocked AND expiring).
 * The badges should answer "how many batches are sold out / understocked / …",
 * so we count each batch at most once per status column.
 *
 * "needsAction" is the morning overview: expired, expiring soon, sold out, or
 * understocked. Overstocked is tracked on its own badge and is NOT included.
 *
 * HOW TO MAINTAIN:
 * - Status rules live in classifyExpirationStatus / classifyStockStatus / needsAction.
 * - Change EXPIRING_SOON_DAYS or the stock thresholds above if the business rules change.
 * - Do not sum the individual badges to get "Need action" — a batch can appear in
 *   more than one detail badge, so the aggregate would be too high.
 */
export function summarizeBatchStatusCounts(
  items: InventoryItem[],
  now: Date = new Date()
) {
  let needsActionCount = 0;
  let outOfStock = 0;
  let understocked = 0;
  let overstocked = 0;
  let expiringSoon = 0;
  let expired = 0;

  for (const item of items) {
    if (needsAction(item, now)) needsActionCount += 1;

    const stock = classifyStockStatus(item);
    if (stock === "out_of_stock") outOfStock += 1;
    else if (stock === "understocked") understocked += 1;
    else if (stock === "overstocked") overstocked += 1;

    const expiration = classifyExpirationStatus(item, now);
    if (expiration === "expired") expired += 1;
    else if (expiration === "expiring_soon") expiringSoon += 1;
  }

  return {
    needsAction: needsActionCount,
    outOfStock,
    understocked,
    overstocked,
    expiringSoon,
    expired,
  };
}

/* -------------------------------------------------------------------------- */
/* FILTERING (morning review list)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Filters the batch list for the search box and the action filter on the main page.
 *
 * Action filter meanings:
 *   needs_action   → expired, expiring soon, out of stock, or understocked
 *                    (the default morning view — what needs a decision today)
 *   expired / expiring_soon / out_of_stock / understocked / overstocked
 *                  → that single problem only
 *   healthy        → shelf life ok AND stock level healthy
 *   all            → every batch
 *
 * Search matches name, location, sales channel, storage condition, or a
 * customer location in the batch's running list.
 */
export function filterInventory(
  items: InventoryItem[],
  search: string,
  actionFilter: ActionFilter,
  now: Date = new Date()
): InventoryItem[] {
  const q = search.trim().toLowerCase();

  return items.filter((item) => {
    const expiration = classifyExpirationStatus(item, now);
    const stock = classifyStockStatus(item);
    const healthy = expiration === "ok" && stock === "healthy";

    switch (actionFilter) {
      case "needs_action":
        if (!needsAction(item, now)) return false;
        break;
      case "expired":
        if (expiration !== "expired") return false;
        break;
      case "expiring_soon":
        if (expiration !== "expiring_soon") return false;
        break;
      case "out_of_stock":
        if (stock !== "out_of_stock") return false;
        break;
      case "understocked":
        if (stock !== "understocked") return false;
        break;
      case "overstocked":
        if (stock !== "overstocked") return false;
        break;
      case "healthy":
        if (!healthy) return false;
        break;
      case "all":
        break;
    }

    if (!q) return true;
    return (
      item.name.toLowerCase().includes(q) ||
      item.location.toLowerCase().includes(q) ||
      item.salesChannel.toLowerCase().includes(q) ||
      item.storageCondition.toLowerCase().includes(q) ||
      item.customerLocations.some((loc) => loc.toLowerCase().includes(q))
    );
  });
}

/* -------------------------------------------------------------------------- */
/* UPDATES (kept for the paused Department Data Sync buttons)                 */
/* -------------------------------------------------------------------------- */

/**
 * Applies incoming supplies and sales to a copy of the batch list.
 * Matching is by brand + product name. New deliveries without a matching batch
 * become a new batch row (location/channel default to "Unspecified" / "Retail").
 *
 * MAINTENANCE: Does not write files — the API route saves the result.
 */
export function applyInventoryUpdates(
  inventory: InventoryItem[],
  sales: SalesItem[],
  incoming: IncomingItem[]
): InventoryItem[] {
  const batches: InventoryItem[] = inventory.map((item) => ({
    ...item,
    customerLocations: [...item.customerLocations],
  }));

  /** Finds a batch by its display name, ignoring upper/lower case. */
  function findBatch(name: string): InventoryItem | undefined {
    const wanted = name.trim().toLowerCase();
    return batches.find((batch) => batch.name.toLowerCase() === wanted);
  }

  for (const delivery of incoming) {
    const batch = findBatch(delivery.name);
    if (batch) {
      batch.quantity += delivery.quantity;
      if (delivery.expirationDate) {
        // Keep the earlier (more urgent) expiration date.
        if (!batch.expirationDate || delivery.expirationDate < batch.expirationDate) {
          batch.expirationDate = delivery.expirationDate;
        }
      }
      if (delivery.storageCondition) batch.storageCondition = delivery.storageCondition;
      continue;
    }

    const location = delivery.location?.trim() || "Unspecified";
    const salesChannel = delivery.salesChannel?.trim() || "Retail";
    const storageCondition = delivery.storageCondition || "Unspecified";
    const productName = delivery.name;
    const brand = "";
    const batchKey = [location, productName, brand, storageCondition, salesChannel].join("|");

    batches.push({
      batchKey,
      lineNumber: 0,
      sourceRowCount: 1,
      csvProductId: "",
      productName,
      brand,
      name: delivery.name,
      location,
      salesChannel,
      storageCondition,
      quantity: delivery.quantity,
      minimumStockThreshold: DEFAULT_MINIMUM_STOCK_THRESHOLD,
      reorderQuantity: DEFAULT_REORDER_QUANTITY,
      expirationDate: delivery.expirationDate || "",
      totalValue: 0,
      approxTotalRevenue: 0,
      pricePerUnit: 0,
      customerLocations: [],
      recordDate: appToday().toISOString().slice(0, 10),
    });
  }

  for (const sale of sales) {
    const batch = findBatch(sale.name);
    if (!batch) continue;
    // Status math ignores quantity sold, but an explicit update still reduces
    // the Quantity column so the list stays truthful after a sync.
    batch.quantity = Math.max(0, batch.quantity - sale.quantitySold);
  }

  return batches;
}

/* -------------------------------------------------------------------------- */
/* CURATED REPORT                                                             */
/* -------------------------------------------------------------------------- */

const ACTION_PRIORITY: Record<string, number> = {
  expired: 0,
  out_of_stock: 1,
  expiring_soon: 2,
  understocked: 3,
  overstocked: 4,
  healthy: 5,
  ok: 5,
};

/**
 * Builds the curated inventory report for the operations manager.
 * Lines are sorted worst-first so the top of the list is the morning work queue.
 */
export function generateStockReport(items: InventoryItem[], now: Date = new Date()): StockReport {
  const reference = appToday(now);
  const alerts = buildAlerts(items, now);

  const lines: StockLine[] = items
    .map((item) => {
      const days = daysUntilExpiration(item, now);
      const expirationStatus = classifyExpirationStatus(item, now);
      const stockStatus = classifyStockStatus(item);
      return {
        ...item,
        expirationStatus,
        stockStatus,
        daysUntilExpiration: Number.isFinite(days) ? days : 9999,
        needsAction: needsAction(item, now),
      };
    })
    .sort((a, b) => {
      const aRank = Math.min(
        ACTION_PRIORITY[a.expirationStatus] ?? 5,
        ACTION_PRIORITY[a.stockStatus] ?? 5
      );
      const bRank = Math.min(
        ACTION_PRIORITY[b.expirationStatus] ?? 5,
        ACTION_PRIORITY[b.stockStatus] ?? 5
      );
      return aRank - bRank || a.daysUntilExpiration - b.daysUntilExpiration;
    });

  const totals = {
    itemCount: lines.length,
    totalUnits: Math.round(lines.reduce((sum, line) => sum + line.quantity, 0)),
    outOfStockCount: lines.filter((l) => l.stockStatus === "out_of_stock").length,
    understockedCount: lines.filter((l) => l.stockStatus === "understocked").length,
    overstockedCount: lines.filter((l) => l.stockStatus === "overstocked").length,
    expiringSoonCount: lines.filter((l) => l.expirationStatus === "expiring_soon").length,
    expiredCount: lines.filter((l) => l.expirationStatus === "expired").length,
    healthyCount: lines.filter(
      (l) => l.expirationStatus === "ok" && l.stockStatus === "healthy"
    ).length,
    needsActionCount: lines.filter((l) => l.needsAction).length,
  };

  const recommendations = buildRecommendations(lines);

  const summary = [
    `Reviewed ${totals.itemCount.toLocaleString()} inventory batches (${totals.totalUnits.toLocaleString()} units) as of ${reference.toISOString().slice(0, 10)}.`,
    totals.needsActionCount > 0
      ? `${totals.needsActionCount} need action today.`
      : "No urgent action items.",
    totals.expiredCount + totals.expiringSoonCount > 0
      ? `${totals.expiredCount} expired / ${totals.expiringSoonCount} expiring within ${EXPIRING_SOON_DAYS} days.`
      : "No immediate expiration risk.",
    totals.understockedCount + totals.outOfStockCount > 0
      ? `${totals.outOfStockCount} sold out / ${totals.understockedCount} under the reorder line.`
      : "Reorder lines are currently covered.",
  ].join(" ");

  return {
    generatedAt: now.toISOString(),
    referenceDate: reference.toISOString().slice(0, 10),
    summary,
    recommendations,
    totals,
    lines,
    alerts,
  };
}

/** Joins a few example names into a short, readable sentence fragment. */
function listSample(values: string[], limit = 6): string {
  const shown = values.slice(0, limit).join("; ");
  const hidden = values.length - limit;
  return hidden > 0 ? `${shown}; +${hidden} more` : shown;
}

/** Plain-language action list for the operations manager. */
function buildRecommendations(lines: StockLine[]): string[] {
  const tips: string[] = [];

  const expired = lines.filter((l) => l.expirationStatus === "expired");
  if (expired.length > 0) {
    tips.push(
      `Remove or markdown ${expired.length} expired batch(es): ${listSample(
        expired.map((l) => `${l.name} @ ${l.location}`)
      )}.`
    );
  }

  const expiring = lines.filter((l) => l.expirationStatus === "expiring_soon");
  if (expiring.length > 0) {
    tips.push(
      `Push sales or rotate forward ${expiring.length} batch(es) within ${EXPIRING_SOON_DAYS} days: ${listSample(
        expiring.map((l) => `${l.name} @ ${l.location} (${l.daysUntilExpiration}d)`)
      )}.`
    );
  }

  const needReorder = lines.filter(
    (l) => l.stockStatus === "out_of_stock" || l.stockStatus === "understocked"
  );
  if (needReorder.length > 0) {
    tips.push(
      `Place supplier reorders for ${needReorder.length} batch(es): ${listSample(
        needReorder.map(
          (l) =>
            `${l.name} @ ${l.location} (on hand ${round1(l.quantity)}, reorder ${round1(l.reorderQuantity)})`
        )
      )}.`
    );
  }

  const overstocked = lines.filter((l) => l.stockStatus === "overstocked");
  if (overstocked.length > 0) {
    tips.push(
      `Review overstock / pause POs for ${overstocked.length} batch(es): ${listSample(
        overstocked.map((l) => `${l.name} @ ${l.location}`)
      )}.`
    );
  }

  if (tips.length === 0) {
    tips.push("Inventory looks balanced — no urgent supplier outreach required today.");
  }

  return tips;
}
