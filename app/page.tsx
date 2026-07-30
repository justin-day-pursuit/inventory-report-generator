/**
 * ============================================================================
 * MAIN MONITORING PAGE (app/page.tsx)
 * ============================================================================
 * WHAT THIS PAGE IS FOR:
 * Morning workbench for the inventory coordinator. Top-to-bottom:
 *   1) Alert summary cards (Need action overview, then sold out / understocked /
 *      expiring / expired — each number is a BATCH count; Overstocked badge is off)
 *   2) Batch list focused on what needs action today
 *   3) Curated stock report for the operations manager
 *      (success/error notifications for the report live in this section)
 *   4) Department data sync panel — commented out; search "DEPARTMENT DATA SYNC"
 *
 * WHERE THE ROWS COME FROM:
 * data/inventory/inventory.csv, served by /api/inventory. Lines that share the same
 * Location + Product Name + Brand + Storage Condition + Sales Channel are rolled
 * into one BATCH. Quantity and thresholds are summed; expiration is the earliest
 * of (Expiration Date) and (Production Date + Shelf Life) across the group.
 *
 * COLUMNS SHOWN:
 *   Name (Brand + Product Name) · Location · Sales Channel · Storage Conditions ·
 *   Quantity · Expiration · Expiration Status · Stock Status
 *
 * DEFAULT FILTER:
 * "Needs action" — expired, expiring within 14 days, sold out, or understocked.
 * That is the morning list the coordinator asked for: what needs a decision today
 * without reading every row.
 *
 * TEST CLOCK (shown on the page as "Today's Date"):
 * Status is measured against APP_REFERENCE_DATE in lib/inventory.ts (near the
 * earliest expiration in the dataset), not the real calendar, so shelf-life
 * badges stay useful on this historical export. The header line under the
 * Stockflow title shows that date, the expiring window, and how many batches
 * need action — written for a coordinator, not a developer.
 *
 * HOW TO MAINTAIN:
 * - DEFAULT_PAGE_SIZE / PAGE_SIZE_OPTIONS control how many rows show per page.
 * - To change the fake "today" or the 14-day expiring window, edit
 *   APP_REFERENCE_DATE / EXPIRING_SOON_DAYS in lib/inventory.ts (not this file).
 * - Badge numbers come from summarizeBatchStatusCounts in lib/inventory.ts via
 *   /api/inventory (batch counts, not alert-message counts). "Need action" is the
 *   morning aggregate; do not add the other badges together.
 * - Clicking a badge sets the inventory list filter dropdown to the matching
 *   option (same values as the "Show" filter). Search this file for applyBadgeFilter.
 * - The small name/location/status chips under the badges are switched off —
 *   search "ITEM STATUS CHIPS (SWITCHED OFF)" to restore them.
 * - The whole Department data sync section is commented out — search
 *   "DEPARTMENT DATA SYNC (SWITCHED OFF)" to restore the panel.
 * - Report success/error banners live in the Curated inventory report section
 *   (message / error state), not in the sync panel.
 * - When you change visible text or layout, leave a short plain-English comment
 *   so a non-technical editor can find and update it later.
 * ============================================================================
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  APP_REFERENCE_DATE,
  EXPIRING_SOON_DAYS,
  classifyExpirationStatus,
  classifyStockStatus,
  filterInventory,
  type ActionFilter,
  type ExpirationStatus,
  /* ITEM STATUS CHIPS (SWITCHED OFF) — type for the commented chip strip below.
  type InventoryAlert,
  */
  type InventoryItem,
  type StockReport,
  type StockStatus,
} from "@/lib/inventory";

/** How many batch rows show on one page when the page first opens. */
const DEFAULT_PAGE_SIZE = 50;

/** Choices offered in the "Show … rows" dropdown above the table. */
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500];

/** How many report rows to list under the curated report. */
const REPORT_ROW_LIMIT = 100;

type AlertCounts = {
  /** Morning overview: batches that are expired, expiring soon, sold out, or understocked. */
  needsAction: number;
  outOfStock: number;
  understocked: number;
  overstocked: number;
  expiringSoon: number;
  expired: number;
};

const EMPTY_COUNTS: AlertCounts = {
  needsAction: 0,
  outOfStock: 0,
  understocked: 0,
  overstocked: 0,
  expiringSoon: 0,
  expired: 0,
};

type ReportResponse = StockReport & {
  lineTotal?: number;
  alertTotal?: number;
};

/** Shows a stock figure with thousands separators and at most two decimals. */
function formatUnits(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function Home() {
  /* ---------- Inventory display state ---------- */
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sourceRecordCount, setSourceRecordCount] = useState(0);
  const [referenceDate, setReferenceDate] = useState(APP_REFERENCE_DATE);
  /* ITEM STATUS CHIPS (SWITCHED OFF) — re-enable with the chip strip below the badges.
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [alertTotal, setAlertTotal] = useState(0);
  */
  const [alertCounts, setAlertCounts] = useState<AlertCounts>(EMPTY_COUNTS);
  const [search, setSearch] = useState("");
  /** Default morning view: only batches that need a decision today. */
  const [actionFilter, setActionFilter] = useState<ActionFilter>("needs_action");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  /* ---------- UI status messages ---------- */
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [reporting, setReporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);

  useEffect(() => {
    void refreshInventory();
  }, []);

  /** Fetches the unique batch list plus alert badge counts from /api/inventory. */
  async function refreshInventory() {
    setLoadingInventory(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load inventory.");
      setInventory(data.items ?? []);
      setSourceRecordCount(data.sourceRecordCount ?? 0);
      setReferenceDate(data.referenceDate ?? APP_REFERENCE_DATE);
      /* ITEM STATUS CHIPS (SWITCHED OFF) — paired with the chip strip under the badges.
      setAlerts(data.alerts ?? []);
      setAlertTotal(data.alertTotal ?? (data.alerts?.length ?? 0));
      */
      setAlertCounts({ ...EMPTY_COUNTS, ...(data.alertCounts ?? {}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory.");
    } finally {
      setLoadingInventory(false);
    }
  }

  /**
   * Asks the API to build a curated report from data/inventory/inventory.csv.
   * The server reads the file itself so the browser never has to upload the dataset.
   */
  async function generateReport() {
    setReporting(true);
    setError(null);
    try {
      const res = await fetch("/api/report");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to generate report.");
      setReport(data as ReportResponse);
      setMessage("Curated inventory report ready.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report.");
    } finally {
      setReporting(false);
    }
  }

  /* ==========================================================================
   * SWITCHED OFF — DEPARTMENT DATA SYNC HANDLERS
   * The buttons stay visible but do nothing. Search this block to re-enable.
   * ========================================================================== */

  /* ---------- Search / filter / pagination ---------- */
  const filtered = useMemo(
    () => filterInventory(inventory, search, actionFilter),
    [inventory, search, actionFilter]
  );

  const needsActionCount = useMemo(
    () => filterInventory(inventory, "", "needs_action").length,
    [inventory]
  );

  /**
   * Applies the inventory list filter that matches a clicked alert badge.
   * Also jumps back to page 1 of the list. Does NOT scroll the page — the
   * coordinator stays on the badge strip and can glance down when ready.
   *
   * Badge → filter mapping (must stay in sync with the <select> options below):
   *   Need action   → needs_action
   *   Sold out      → out_of_stock
   *   Understocked  → understocked
   *   Expiring soon → expiring_soon
   *   Expired       → expired
   * Overstocked has no badge (filter + stock status still exist — see Show dropdown).
   */
  function applyBadgeFilter(filter: ActionFilter) {
    setActionFilter(filter);
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
      <header className="anim-rise mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--accent)]">
            Warehouse ops
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
            Stockflow
          </h1>
          {/*
            Short pitch under the title — what Stockflow does in one sentence.
            Edit the wording here if the product description changes; keep it
            friendly and non-technical.
          */}
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            See what needs attention today — low stock, upcoming expirations, and
            reorder candidates — without reading every row of the dairy spreadsheet.
          </p>
          {/*
            STATUS LINE (same text size as the pitch above so it is easy to spot)
            Shows three facts the coordinator needs at a glance:
              1) "Today's Date" — the date shelf life is judged against
                 (APP_REFERENCE_DATE from lib/inventory.ts; not the real calendar
                 while we use the historical dairy CSV)
              2) Expiring window — how many days ahead counts as "expiring soon"
              3) How many batches currently need action (bold number)
            HOW TO MAINTAIN:
              - Rename labels in the JSX below (e.g. "Today's Date").
              - Change the date or window in lib/inventory.ts, not here.
              - needsActionCount is calculated from the loaded inventory list.
          */}
          <p className="mt-2 text-[var(--muted)]">
            <span className="font-bold">Today&apos;s Date</span>:{" "}
            <span className="font-mono">{referenceDate}</span>
            {" · "}
            expiring window: {EXPIRING_SOON_DAYS} days
            {" · "}
            <span className="font-bold">{needsActionCount.toLocaleString()}</span>{" "}
            batches need action
          </p>
        </div>
        <div className="shrink-0 sm:pt-1">
          <ThemeToggle />
        </div>
      </header>

      {/*
        ALERT BADGES — morning overview strip under the page heading.
        Each number is how many BATCHES currently have that status
        (from /api/inventory → summarizeBatchStatusCounts).

        Order matters:
          1) Need action  — aggregate of sold out + understocked + expiring soon + expired
                            (a batch counted once even if it has more than one problem)
          2–5) Detail badges: Sold out, Understocked, Expiring soon, Expired

        OVERSTOCKED BADGE (SWITCHED OFF):
          There is no Overstocked summary badge on purpose. Overstocked batches
          still get an "overstocked" Stock Status in the table, and the Show
          filter still has an "Overstocked" option. The badge JSX is commented
          out below — uncomment it and set the grid back to lg:grid-cols-6 to
          restore the badge.

        CLICK BEHAVIOUR:
          Each badge is a button. Clicking it selects the matching option in the
          inventory list filter dropdown (Needs action / Sold out / …) and resets
          the list to page 1. The page does not scroll — the active badge is
          highlighted to match the dropdown.

        HOW TO MAINTAIN:
          - Rename labels in the AlertCard calls below.
          - To change which filter a badge applies, edit the `filter` prop
            (must be a value from the ActionFilter type / <select> options).
          - Status rules live in lib/inventory.ts — not here.
          - Grid is 5 columns on large screens (Need action + 4 detail badges).
      */}
      <section
        aria-label="Inventory alerts"
        className="anim-rise anim-rise-delay-1 mb-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
      >
        <AlertCard
          label="Need action"
          value={alertCounts.needsAction}
          tone="action"
          pulse={alertCounts.needsAction > 0}
          filter="needs_action"
          active={actionFilter === "needs_action"}
          onSelect={applyBadgeFilter}
        />
        <AlertCard
          label="Sold out"
          value={alertCounts.outOfStock}
          tone="danger"
          pulse={alertCounts.outOfStock > 0}
          filter="out_of_stock"
          active={actionFilter === "out_of_stock"}
          onSelect={applyBadgeFilter}
        />
        <AlertCard
          label="Understocked"
          value={alertCounts.understocked}
          tone="warn"
          filter="understocked"
          active={actionFilter === "understocked"}
          onSelect={applyBadgeFilter}
        />
        {/*
          OVERSTOCKED BADGE (SWITCHED OFF) — keep status + Show filter; no badge.
        <AlertCard
          label="Overstocked"
          value={alertCounts.overstocked}
          tone="over"
          filter="overstocked"
          active={actionFilter === "overstocked"}
          onSelect={applyBadgeFilter}
        />
        */}
        <AlertCard
          label="Expiring soon"
          value={alertCounts.expiringSoon}
          tone="warn"
          pulse={alertCounts.expiringSoon > 0}
          filter="expiring_soon"
          active={actionFilter === "expiring_soon"}
          onSelect={applyBadgeFilter}
        />
        <AlertCard
          label="Expired"
          value={alertCounts.expired}
          tone="danger"
          filter="expired"
          active={actionFilter === "expired"}
          onSelect={applyBadgeFilter}
        />
      </section>

      {/*
        ITEM STATUS CHIPS (SWITCHED OFF)
        ---------------------------------------------------------
        These small chips sat under the big summary badges and listed
        individual batches (name · location · status), up to 8, with a
        "+N more" note. They were removed from the morning view so the
        page goes straight from the big badges to the inventory list.

        HOW TO TURN THEM BACK ON:
          1) Uncomment the block below.
          2) Uncomment the `alerts` / `alertTotal` state and the
             setAlerts / setAlertTotal lines inside refreshInventory
             (search this file for "ITEM STATUS CHIPS").
          3) Uncomment the InventoryAlert import at the top if needed.
        The API still returns `alerts` / `alertTotal` — nothing else to change.
      */}
      {/*
      {alerts.length > 0 && (
        <div className="anim-rise anim-rise-delay-1 mb-6 flex flex-wrap gap-2">
          {alerts.slice(0, 8).map((alert, index) => (
            <span
              key={`${alert.kind}-${alert.name}-${alert.location}-${index}`}
              className="rounded-md border border-[var(--panel-border)] bg-[var(--surface-soft)] px-2.5 py-1 text-xs text-[var(--muted)]"
              title={alert.message}
            >
              <strong className="text-[var(--foreground)]">{alert.name}</strong>
              {" · "}
              {alert.location}
              {" · "}
              {alert.kind.replaceAll("_", " ")}
            </span>
          ))}
          {alertTotal > 8 && (
            <span className="px-2.5 py-1 text-xs text-[var(--muted)]">
              +{(alertTotal - 8).toLocaleString()} more
            </span>
          )}
        </div>
      )}
      */}

      {/* ---- Inventory batch list ---- */}
      <section
        id="inventory-batches"
        aria-label="Current inventory"
        className="anim-rise anim-rise-delay-2 mb-8 scroll-mt-4"
      >
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Inventory batches</h2>
            <p className="text-sm text-[var(--muted)]">
              {loadingInventory
                ? "Loading stock…"
                : `${filtered.length.toLocaleString()} of ${inventory.length.toLocaleString()} batches shown` +
                  (sourceRecordCount > 0
                    ? ` · grouped from ${sourceRecordCount.toLocaleString()} dataset rows`
                    : "")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshInventory()}
            className="rounded-lg border border-[var(--control-border)] px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-[var(--hover-fill)] hover:text-[var(--foreground)]"
          >
            Refresh
          </button>
        </div>

        <div className="inventory-shell">
          <div className="inventory-toolbar">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative block min-w-0 flex-1" htmlFor="inventory-search">
                <span className="sr-only">Search inventory</span>
                <input
                  id="inventory-search"
                  name="inventory-search"
                  type="search"
                  autoComplete="off"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search name, location, channel, or storage…"
                  className="input-field w-full rounded-lg px-3 py-2.5 text-sm outline-none ring-[var(--accent)]/40 placeholder:text-[var(--muted)] focus:ring-2"
                />
              </label>

              {/*
                Action filter dropdown ("Show …").
                "All batches" is listed first so it is easy to find; the page still
                opens on "Needs action" (see actionFilter useState above) for the
                morning work queue. Reorder the <option>s carefully — badge clicks
                use the same value strings.
              */}
              <label
                className="flex items-center gap-2 text-sm text-[var(--muted)]"
                htmlFor="inventory-action-filter"
              >
                <span className="whitespace-nowrap">Show</span>
                <select
                  id="inventory-action-filter"
                  name="inventory-action-filter"
                  value={actionFilter}
                  onChange={(e) => {
                    setActionFilter(e.target.value as ActionFilter);
                    setPage(1);
                  }}
                  className="input-field rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                >
                  <option value="all">All batches</option>
                  <option value="needs_action">Needs action</option>
                  <option value="expired">Expired</option>
                  <option value="expiring_soon">Expiring soon</option>
                  <option value="out_of_stock">Sold out</option>
                  <option value="understocked">Understocked</option>
                  <option value="overstocked">Overstocked</option>
                  <option value="healthy">Healthy</option>
                </select>
              </label>

              <label
                className="flex items-center gap-2 text-sm text-[var(--muted)]"
                htmlFor="inventory-page-size"
              >
                <span className="whitespace-nowrap">Rows</span>
                <select
                  id="inventory-page-size"
                  name="inventory-page-size"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="input-field rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="inventory-scroll">
            <table className="w-full min-w-[960px] border-collapse text-sm">
              <thead className="table-head sticky top-0 text-left text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Location</th>
                  <th className="px-4 py-3 font-medium">Sales Channel</th>
                  <th className="px-4 py-3 font-medium">Storage Conditions</th>
                  <th className="px-4 py-3 text-right font-medium">Quantity</th>
                  <th className="px-4 py-3 font-medium">Expiration</th>
                  <th className="px-4 py-3 font-medium">Expiration Status</th>
                  <th className="px-4 py-3 font-medium">Stock Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-[var(--muted)]">
                      {loadingInventory
                        ? "Loading…"
                        : "No matching batches. Try “All batches” or clear the search."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((item) => {
                    const expirationStatus = classifyExpirationStatus(item);
                    const stockStatus = classifyStockStatus(item);
                    return (
                      <tr
                        key={item.batchKey}
                        className="row-divider hover:bg-[var(--hover-fill)]"
                      >
                        <td
                          className="px-4 py-3 font-medium"
                          title={`${item.sourceRowCount.toLocaleString()} dataset row(s) · reorder ${formatUnits(item.reorderQuantity)} · min ${formatUnits(item.minimumStockThreshold)}`}
                        >
                          {item.name}
                        </td>
                        <td
                          className="px-4 py-3"
                          title={
                            item.customerLocations.length > 0
                              ? `Customer locations: ${item.customerLocations.join(", ")}`
                              : undefined
                          }
                        >
                          {item.location}
                        </td>
                        <td className="px-4 py-3">{item.salesChannel}</td>
                        <td className="px-4 py-3 text-[var(--muted)]">{item.storageCondition}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatUnits(item.quantity)}
                        </td>
                        <td className="px-4 py-3">{item.expirationDate}</td>
                        <td className="px-4 py-3">
                          <ExpirationChip status={expirationStatus} />
                        </td>
                        <td className="px-4 py-3">
                          <StockChip status={stockStatus} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="inventory-pager">
            <p className="text-xs text-[var(--muted)]">
              Page {safePage} of {totalPages.toLocaleString()} · {pageSize} rows per page
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-[var(--control-border)] px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-[var(--control-border)] px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </section>

      {/*
        DEPARTMENT DATA SYNC (SWITCHED OFF)
        ---------------------------------------------------------
        This whole panel (Sales / Incoming / Update inventory buttons) is hidden
        for now. The curated report success/error banners used to sit at the
        bottom of this panel; they now live in the Curated inventory report
        section below so report feedback stays next to Generate report.

        HOW TO TURN THE PANEL BACK ON:
          1) Uncomment the <section>…</section> block below.
          2) Optionally re-enable the button onClick handlers inside it
             (search "SWITCHED OFF — onClick").
          3) Keep the report message/error banners in the report section —
             do not move them back here unless you have a reason to.
      */}
      {/*
      <section
        aria-label="Sync sales and supplies"
        className="anim-rise anim-rise-delay-3 mb-8 rounded-[18px] border border-[var(--panel-border)] bg-[var(--panel)] p-5 backdrop-blur"
      >
        <h2 className="font-display text-xl font-semibold">Department data sync</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          Sales and receiving sync is paused. Batches above already come from the
          inventory spreadsheet. Buttons stay here for a future live feed.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          <div className="surface-card rounded-xl p-4">
            <h3 className="font-medium">Sales data</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Source: <code className="font-mono">data/inventory/inventory.csv</code>
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Sync paused — Quantity Sold is ignored for status calculations for now.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                // SWITCHED OFF — onClick={() => void loadSales()}
                className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-[var(--accent-contrast)] transition hover:bg-[var(--accent-strong)]"
              >
                Load sales data
              </button>
              <button
                type="button"
                // SWITCHED OFF — onClick={checkSales}
                className="rounded-lg border border-[var(--control-border)] px-3.5 py-2 text-sm transition hover:bg-[var(--hover-fill)]"
              >
                Check sales data
              </button>
            </div>
          </div>

          <div className="surface-card rounded-xl p-4">
            <h3 className="font-medium">Incoming supplies</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Source: <code className="font-mono">data/inventory/inventory.csv</code>
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Sync paused — received batches are already part of the list above.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                // SWITCHED OFF — onClick={() => void loadIncoming()}
                className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-[var(--accent-contrast)] transition hover:bg-[var(--accent-strong)]"
              >
                Load incoming supplies
              </button>
              <button
                type="button"
                // SWITCHED OFF — onClick={checkIncoming}
                className="rounded-lg border border-[var(--control-border)] px-3.5 py-2 text-sm transition hover:bg-[var(--hover-fill)]"
              >
                Check incoming supplies
              </button>
            </div>
          </div>

          <div className="surface-card rounded-xl p-4">
            <h3 className="font-medium">Update inventory</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Would write to <code className="font-mono">data/inventory/inventory.csv</code>
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Paused so the dataset above stays exactly as delivered.
            </p>
            <div className="mt-4">
              <button
                type="button"
                // SWITCHED OFF — onClick={() => void updateInventory()}
                className="rounded-lg bg-[var(--info)] px-3.5 py-2 text-sm font-medium text-[var(--accent-contrast)] transition hover:brightness-110"
              >
                Update current inventory
              </button>
            </div>
          </div>
        </div>
      </section>
      */}

      {/*
        CURATED INVENTORY REPORT
        Success and error banners for Generate report (and any future report
        actions) show here — they used to live under Department data sync.
        HOW TO MAINTAIN: edit the message/error <p> tags below; generateReport()
        sets those strings.
      */}
      <section aria-label="Generate inventory report" className="mb-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Curated inventory report</h2>
            <p className="text-sm text-[var(--muted)]">
              Weekly-style status report: reorder candidates, shelf-life risk, and
              overstock — ready for the operations manager.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void generateReport()}
            disabled={reporting || inventory.length === 0}
            className="rounded-lg bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {reporting ? "Generating…" : "Generate report"}
          </button>
        </div>

        {message && (
          <p className="mt-4 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-2 text-sm">
            {message}
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-2 text-sm">
            {error}
          </p>
        )}

        {report && (
          <div
            className="mt-5 rounded-[18px] border border-[var(--panel-border)] bg-[var(--panel)] p-5"
            data-testid="report"
          >
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              Generated {new Date(report.generatedAt).toLocaleString()}
              {" · "}
              status clock {report.referenceDate}
            </p>
            <p className="mt-3 text-[var(--foreground)]">{report.summary}</p>

            <h3 className="mt-5 font-medium">Recommendations</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
              {report.recommendations.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MiniStat label="Batches" value={report.totals.itemCount} />
              <MiniStat label="Units" value={report.totals.totalUnits} />
              <MiniStat label="Need action" value={report.totals.needsActionCount} />
              <MiniStat
                label="Shelf risk"
                value={report.totals.expiringSoonCount + report.totals.expiredCount}
              />
            </div>

            <p className="mt-5 text-xs text-[var(--muted)]">
              Most urgent first — showing{" "}
              {Math.min(REPORT_ROW_LIMIT, report.lines.length).toLocaleString()} of{" "}
              {(report.lineTotal ?? report.lines.length).toLocaleString()} batches.
            </p>

            <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--panel-border)]">
              <table className="w-full min-w-[820px] border-collapse text-sm">
                <thead className="bg-[var(--surface-soft)] text-left text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Location</th>
                    <th className="px-3 py-2 font-medium">Channel</th>
                    <th className="px-3 py-2 text-right font-medium">Quantity</th>
                    <th className="px-3 py-2 font-medium">Expiration</th>
                    <th className="px-3 py-2 font-medium">Expiration Status</th>
                    <th className="px-3 py-2 font-medium">Stock Status</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lines.slice(0, REPORT_ROW_LIMIT).map((line) => (
                    <tr key={line.batchKey} className="row-divider">
                      <td className="px-3 py-2">{line.name}</td>
                      <td className="px-3 py-2">{line.location}</td>
                      <td className="px-3 py-2">{line.salesChannel}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatUnits(line.quantity)}
                      </td>
                      <td className="px-3 py-2">{line.expirationDate}</td>
                      <td className="px-3 py-2">
                        <ExpirationChip status={line.expirationStatus} />
                      </td>
                      <td className="px-3 py-2">
                        <StockChip status={line.stockStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Small presentational helpers                                               */
/* -------------------------------------------------------------------------- */

/**
 * One coloured summary badge in the morning overview strip.
 *
 * HOW TO MAINTAIN:
 * - `label` is the small uppercase title (e.g. "Need action").
 * - `value` is the batch count — keep it a whole number from the API.
 * - `tone` picks the colour: action (green overview), danger, warn, over, info.
 * - `pulse` softly animates when the count is greater than zero.
 * - `filter` / `onSelect` wire the click to the inventory list dropdown.
 * - `active` is true when this badge's filter is the one currently selected.
 * - Padding and type are intentionally compact so six badges fit on one row.
 */
function AlertCard({
  label,
  value,
  tone,
  pulse,
  filter,
  active,
  onSelect,
}: {
  label: string;
  value: number;
  tone: "danger" | "warn" | "over" | "info" | "action";
  pulse?: boolean;
  filter: ActionFilter;
  active: boolean;
  onSelect: (filter: ActionFilter) => void;
}) {
  const color =
    tone === "danger"
      ? "var(--danger)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "over"
          ? "var(--over)"
          : tone === "action"
            ? "var(--accent)"
            : "var(--info)";

  return (
    <button
      type="button"
      onClick={() => onSelect(filter)}
      aria-pressed={active}
      title={`Show ${label.toLowerCase()} batches in the list below`}
      className={`surface-card w-full rounded-xl px-3 py-2.5 text-left transition hover:bg-[var(--hover-fill)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 ${
        pulse ? "alert-pulse" : ""
      }`}
      style={{
        borderColor: `color-mix(in srgb, ${color} ${active || value > 0 ? 55 : 20}%, transparent)`,
        // Stronger coloured edge when this badge matches the list filter.
        boxShadow: active ? `0 0 0 2px color-mix(in srgb, ${color} 55%, transparent)` : undefined,
        background: active ? `color-mix(in srgb, ${color} 10%, transparent)` : undefined,
      }}
    >
      <p className="text-[10px] uppercase tracking-[0.12em] text-[var(--muted)] leading-tight">
        {label}
      </p>
      <p
        className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl"
        style={{ color: value > 0 || active ? color : undefined }}
      >
        {value.toLocaleString()}
      </p>
    </button>
  );
}

/** Colour-coded wording for the Expiration Status column. */
function ExpirationChip({ status }: { status: ExpirationStatus }) {
  const styles: Record<ExpirationStatus, string> = {
    ok: "text-[var(--accent)]",
    expiring_soon: "text-[var(--warn)]",
    expired: "text-[var(--danger)]",
  };
  const labels: Record<ExpirationStatus, string> = {
    ok: "ok",
    expiring_soon: "expiring soon",
    expired: "expired",
  };
  return <span className={`text-xs ${styles[status]}`}>{labels[status]}</span>;
}

/** Colour-coded wording for the Stock Status column. */
function StockChip({ status }: { status: StockStatus }) {
  const styles: Record<StockStatus, string> = {
    healthy: "text-[var(--accent)]",
    understocked: "text-[var(--warn)]",
    overstocked: "text-[var(--over)]",
    out_of_stock: "text-[var(--danger)]",
  };
  const labels: Record<StockStatus, string> = {
    healthy: "healthy",
    understocked: "understocked",
    overstocked: "overstocked",
    out_of_stock: "sold out",
  };
  return <span className={`text-xs ${styles[status]}`}>{labels[status]}</span>;
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="surface-card rounded-lg px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
