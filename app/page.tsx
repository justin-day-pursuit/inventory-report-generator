/**
 * ============================================================================
 * MAIN MONITORING PAGE (app/page.tsx)
 * ============================================================================
 * WHAT THIS PAGE IS FOR:
 * Day-to-day inventory coordinator workspace. Top-to-bottom layout:
 *   1) Alert summary cards (sold out, understocked, overstocked, expiring, expired)
 *   2) Inventory list with sticky search/filter, its own scroll area and a pager
 *   3) Department data sync panel (currently switched off — see the note below)
 *   4) Generate a curated stock report
 *
 * WHERE THE ROWS COME FROM:
 * data/inventory/inventory.csv — one line per dairy product batch — served by
 * /api/inventory. The table columns match the spreadsheet columns:
 *   Product ID · Name (Brand + Product Name) · Quantity (liters/kg) ·
 *   Quantity Sold (liters/kg) · Storage Conditions · Expiration Date · Status
 * "Status" is worked out by the app (see classifyStatus in lib/inventory.ts).
 *
 * HOW TO MAINTAIN (non-technical):
 * - To change how many rows appear per page by default, edit DEFAULT_PAGE_SIZE
 *   below. To offer different choices in the "Show" dropdown, edit PAGE_SIZE_OPTIONS.
 * - The three sync buttons (load sales, check feeds, update inventory) are
 *   intentionally inactive: their onClick lines are commented out. Search this file
 *   for "SWITCHED OFF" to find them and how to switch them back on.
 * - Button labels can be reworded carefully; keep the remaining onClick handlers
 *   (Refresh, Generate report) attached.
 * ============================================================================
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  classifyStatus,
  filterInventory,
  type InventoryAlert,
  type InventoryItem,
  type StockReport,
  type StockStatus,
} from "@/lib/inventory";

/** How many inventory rows show on one page when the page first opens. */
const DEFAULT_PAGE_SIZE = 50;

/** Choices offered in the "Show … rows" dropdown above the table. */
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500];

/** The report can cover thousands of batches; this many rows are listed. */
const REPORT_ROW_LIMIT = 100;

type AlertCounts = {
  outOfStock: number;
  understocked: number;
  overstocked: number;
  expiringSoon: number;
  expired: number;
};

const EMPTY_COUNTS: AlertCounts = {
  outOfStock: 0,
  understocked: 0,
  overstocked: 0,
  expiringSoon: 0,
  expired: 0,
};

/**
 * The report API sends back the report plus how many rows/alerts it had to leave
 * out, so the page can say "showing 100 of 4,325".
 */
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
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [alertTotal, setAlertTotal] = useState(0);
  const [alertCounts, setAlertCounts] = useState<AlertCounts>(EMPTY_COUNTS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StockStatus>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  /* ---------- UI status messages ---------- */
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [reporting, setReporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);

  /* ---------- Initial load of current inventory ---------- */
  useEffect(() => {
    void refreshInventory();
  }, []);

  /** Fetches every batch plus the alert badge counts from /api/inventory. */
  async function refreshInventory() {
    setLoadingInventory(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load inventory.");
      setInventory(data.items ?? []);
      setAlerts(data.alerts ?? []);
      setAlertTotal(data.alertTotal ?? (data.alerts?.length ?? 0));
      setAlertCounts(data.alertCounts ?? EMPTY_COUNTS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory.");
    } finally {
      setLoadingInventory(false);
    }
  }

  /**
   * Asks the API to build a curated report from data/inventory/inventory.csv.
   * The server reads the file itself, so the whole dataset never has to be
   * uploaded back from the browser.
   */
  async function generateReport() {
    setReporting(true);
    setError(null);
    try {
      const res = await fetch("/api/report");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to generate report.");
      setReport(data as ReportResponse);
      setMessage("Curated inventory report ready — scroll down to review.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report.");
    } finally {
      setReporting(false);
    }
  }

  /* ==========================================================================
   * SWITCHED OFF — DEPARTMENT DATA SYNC HANDLERS
   * ==========================================================================
   * The buttons in the "Department data sync" panel below are visible but do
   * nothing on purpose. The code that made them work is kept here, commented
   * out, so it can be switched back on later.
   *
   * TO SWITCH A BUTTON BACK ON:
   *   1) Remove the /* and *\/ around the handler you need below.
   *   2) Uncomment the matching onClick line on that button in the panel.
   *   3) Uncomment the matching pieces of state (sales, incoming, loading flags).
   *
   * The APIs these handlers call (/api/sales, /api/incoming,
   * /api/inventory/update) are all still live, so nothing else has to change.
   *
   * // ---- state used by the handlers ----
   * // const [sales, setSales] = useState<SalesItem[] | null>(null);
   * // const [incoming, setIncoming] = useState<IncomingItem[] | null>(null);
   * // const [loadingSales, setLoadingSales] = useState(false);
   * // const [loadingIncoming, setLoadingIncoming] = useState(false);
   * // const [updating, setUpdating] = useState(false);
   *
   * // ---- "Load sales data" ----
   * // async function loadSales() {
   * //   setLoadingSales(true);
   * //   setError(null);
   * //   setMessage(null);
   * //   try {
   * //     const res = await fetch("/api/sales");
   * //     const data = await res.json();
   * //     if (!res.ok) throw new Error(data?.error ?? "Failed to load sales.");
   * //     setSales(data.items ?? []);
   * //     setMessage(`Loaded ${data.count ?? 0} sales row(s) from ${data.source}.`);
   * //   } catch (err) {
   * //     setError(err instanceof Error ? err.message : "Failed to load sales.");
   * //   } finally {
   * //     setLoadingSales(false);
   * //   }
   * // }
   *
   * // ---- "Load incoming supplies" ----
   * // async function loadIncoming() {
   * //   setLoadingIncoming(true);
   * //   setError(null);
   * //   setMessage(null);
   * //   try {
   * //     const res = await fetch("/api/incoming");
   * //     const data = await res.json();
   * //     if (!res.ok) throw new Error(data?.error ?? "Failed to load incoming supplies.");
   * //     setIncoming(data.items ?? []);
   * //     setMessage(`Loaded ${data.count ?? 0} incoming row(s) from ${data.source}.`);
   * //   } catch (err) {
   * //     setError(err instanceof Error ? err.message : "Failed to load incoming supplies.");
   * //   } finally {
   * //     setLoadingIncoming(false);
   * //   }
   * // }
   *
   * // ---- "Check sales data" / "Check incoming supplies" (open a review tab) ----
   * // function checkSales() {
   * //   window.open("/check/sales", "_blank", "noopener,noreferrer");
   * // }
   * // function checkIncoming() {
   * //   window.open("/check/incoming", "_blank", "noopener,noreferrer");
   * // }
   *
   * // ---- "Update current inventory" (writes data/inventory/inventory.csv) ----
   * // async function updateInventory() {
   * //   setUpdating(true);
   * //   setError(null);
   * //   setMessage(null);
   * //   try {
   * //     const res = await fetch("/api/inventory/update", {
   * //       method: "POST",
   * //       headers: { "Content-Type": "application/json" },
   * //       body: JSON.stringify({
   * //         sales: sales ?? undefined,
   * //         incoming: incoming ?? undefined,
   * //       }),
   * //     });
   * //     const data = await res.json();
   * //     if (!res.ok) throw new Error(data?.error ?? "Failed to update inventory.");
   * //     setInventory(data.items ?? []);
   * //     setAlerts(data.alerts ?? []);
   * //     setAlertTotal(data.alertTotal ?? 0);
   * //     setAlertCounts(data.alertCounts ?? EMPTY_COUNTS);
   * //     setPage(1);
   * //     setMessage(
   * //       `Inventory updated using ${data.applied?.incomingRows ?? 0} incoming and ${data.applied?.salesRows ?? 0} sales row(s).`
   * //     );
   * //   } catch (err) {
   * //     setError(err instanceof Error ? err.message : "Failed to update inventory.");
   * //   } finally {
   * //     setUpdating(false);
   * //   }
   * // }
   * ========================================================================== */

  /* ---------- Search / filter / pagination (list-only; toolbar stays put) ---------- */
  const filtered = useMemo(
    () => filterInventory(inventory, search, statusFilter),
    [inventory, search, statusFilter]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  // Clamp the page if filters shrink the result set (avoids an extra effect).
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
      {/* ---- Brand / page intro (one composition, brand-forward) ---- */}
      <header className="anim-rise mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--accent)]">
            Warehouse ops
          </p>
          <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
            Stockflow
          </h1>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Monitor live dairy stock batch by batch, spot expiry and restock risk early,
            and generate an accurate restock report without retyping department data by hand.
          </p>
        </div>
        <div className="shrink-0 sm:pt-1">
          <ThemeToggle />
        </div>
      </header>

      {/* ---- Alert badges / summary cards ---- */}
      <section
        aria-label="Inventory alerts"
        className="anim-rise anim-rise-delay-1 mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <AlertCard
          label="Sold out"
          value={alertCounts.outOfStock}
          tone="danger"
          pulse={alertCounts.outOfStock > 0}
        />
        <AlertCard label="Understocked" value={alertCounts.understocked} tone="warn" />
        <AlertCard label="Overstocked" value={alertCounts.overstocked} tone="over" />
        <AlertCard
          label="Expiring soon"
          value={alertCounts.expiringSoon}
          tone="warn"
          pulse={alertCounts.expiringSoon > 0}
        />
        <AlertCard label="Expired" value={alertCounts.expired} tone="danger" />
      </section>

      {/* Compact alert strip so coordinators see WHAT needs attention */}
      {alerts.length > 0 && (
        <div className="anim-rise anim-rise-delay-1 mb-6 flex flex-wrap gap-2">
          {alerts.slice(0, 8).map((alert, index) => (
            <span
              key={`${alert.kind}-${alert.productId}-${index}`}
              className="rounded-md border border-[var(--panel-border)] bg-[var(--surface-soft)] px-2.5 py-1 text-xs text-[var(--muted)]"
              title={`${alert.name}: ${alert.message}`}
            >
              <strong className="text-[var(--foreground)]">{alert.name}</strong> ·{" "}
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

      {/* ---- Inventory list container (own scroll + pager; sticky search) ---- */}
      <section aria-label="Current inventory" className="anim-rise anim-rise-delay-2 mb-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Current inventory</h2>
            <p className="text-sm text-[var(--muted)]">
              {loadingInventory
                ? "Loading stock…"
                : `${filtered.length.toLocaleString()} of ${inventory.length.toLocaleString()} product batches shown`}
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
          {/* Sticky toolbar — does NOT scroll away with the table body */}
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
                  placeholder="Search product id, name, or storage condition…"
                  className="input-field w-full rounded-lg px-3 py-2.5 text-sm outline-none ring-[var(--accent)]/40 placeholder:text-[var(--muted)] focus:ring-2"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]" htmlFor="inventory-status-filter">
                <span className="whitespace-nowrap">Filter</span>
                <select
                  id="inventory-status-filter"
                  name="inventory-status-filter"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as "all" | StockStatus);
                    setPage(1);
                  }}
                  className="input-field rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                >
                  <option value="all">All statuses</option>
                  <option value="healthy">Healthy</option>
                  <option value="understocked">Understocked</option>
                  <option value="overstocked">Overstocked</option>
                  <option value="expiring_soon">Expiring soon</option>
                  <option value="expired">Expired</option>
                  <option value="out_of_stock">Sold out</option>
                </select>
              </label>
              {/* How many rows to display at a time — 50 by default, more on request */}
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]" htmlFor="inventory-page-size">
                <span className="whitespace-nowrap">Show</span>
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
                      {size} rows
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Scrollable table body only */}
          <div className="inventory-scroll">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead className="table-head sticky top-0 text-left text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Product ID</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 text-right font-medium">Quantity (liters/kg)</th>
                  <th className="px-4 py-3 text-right font-medium">Quantity Sold (liters/kg)</th>
                  <th className="px-4 py-3 font-medium">Storage Conditions</th>
                  <th className="px-4 py-3 font-medium">Expiration Date</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[var(--muted)]">
                      {loadingInventory
                        ? "Loading…"
                        : "No matching products. Clear the search/filter or add rows to data/inventory/inventory.csv."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((item) => (
                    <tr key={item.rowId} className="row-divider hover:bg-[var(--hover-fill)]">
                      <td className="font-mono px-4 py-3 text-[var(--muted)]">{item.productId}</td>
                      <td className="px-4 py-3 font-medium">{item.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatUnits(item.quantity)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatUnits(item.quantitySold)}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted)]">{item.storageCondition}</td>
                      <td className="px-4 py-3">{item.expirationDate}</td>
                      <td className="px-4 py-3">
                        <StatusChip status={classifyStatus(item)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Page navigation stays pinned under the scroll area */}
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

      {/* ---- Sales / supplies integration controls ----
           SWITCHED OFF: every button in this panel keeps its place in the layout
           but has its onClick commented out, so clicking does nothing. ---- */}
      <section
        aria-label="Sync sales and supplies"
        className="anim-rise anim-rise-delay-3 mb-8 rounded-[18px] border border-[var(--panel-border)] bg-[var(--panel)] p-5 backdrop-blur"
      >
        <h2 className="font-display text-xl font-semibold">Department data sync</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          Sales and receiving figures now arrive inside the inventory spreadsheet itself,
          so these sync controls are paused. The buttons stay here for a future live feed.
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {/* Sales column */}
          <div className="surface-card rounded-xl p-4">
            <h3 className="font-medium">Sales data</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Source: <code className="font-mono">data/inventory/inventory.csv</code> ·
              column <code className="font-mono">Quantity Sold (liters/kg)</code>
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Sync paused — sold quantities are already part of the inventory list above.
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

          {/* Incoming column */}
          <div className="surface-card rounded-xl p-4">
            <h3 className="font-medium">Incoming supplies</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Source: <code className="font-mono">data/inventory/inventory.csv</code> ·
              batch quantity, expiration date and storage condition
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Sync paused — every received batch is already listed in the inventory above.
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

          {/* Update column */}
          <div className="surface-card rounded-xl p-4">
            <h3 className="font-medium">Update inventory</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Would write to <code className="font-mono">data/inventory/inventory.csv</code>
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Paused as well, so the dataset above stays exactly as delivered.
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
      </section>

      {/* ---- Report generation ---- */}
      <section aria-label="Generate inventory report" className="mb-10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold">Curated inventory report</h2>
            <p className="text-sm text-[var(--muted)]">
              Cross-checks minimum stock levels, shelf life, and how fast each batch is selling.
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

        {report && (
          <div className="mt-5 rounded-[18px] border border-[var(--panel-border)] bg-[var(--panel)] p-5" data-testid="report">
            <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
              Generated {new Date(report.generatedAt).toLocaleString()}
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
              <MiniStat label="Units in stock" value={report.totals.totalUnits} />
              <MiniStat
                label="Need reorder"
                value={report.totals.outOfStockCount + report.totals.understockedCount}
              />
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
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="bg-[var(--surface-soft)] text-left text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">Product ID</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 text-right font-medium">Quantity (liters/kg)</th>
                    <th className="px-3 py-2 text-right font-medium">Quantity Sold (liters/kg)</th>
                    <th className="px-3 py-2 text-right font-medium">In stock</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Days to expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lines.slice(0, REPORT_ROW_LIMIT).map((line) => (
                    <tr key={line.rowId} className="row-divider">
                      <td className="font-mono px-3 py-2 text-[var(--muted)]">{line.productId}</td>
                      <td className="px-3 py-2">{line.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatUnits(line.quantity)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatUnits(line.quantitySold)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatUnits(line.quantityInStock)}
                      </td>
                      <td className="px-3 py-2">
                        <StatusChip status={line.status} />
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {line.daysUntilExpiration}
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
/* Small presentational helpers (kept in this file for easy maintenance)      */
/* -------------------------------------------------------------------------- */

function AlertCard({
  label,
  value,
  tone,
  pulse,
}: {
  label: string;
  value: number;
  tone: "danger" | "warn" | "over" | "info";
  pulse?: boolean;
}) {
  const color =
    tone === "danger"
      ? "var(--danger)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "over"
          ? "var(--over)"
          : "var(--info)";

  return (
    <div
      className={`surface-card rounded-xl px-4 py-3 ${pulse ? "alert-pulse" : ""}`}
      style={{ borderColor: value > 0 ? `color-mix(in srgb, ${color} 45%, transparent)` : undefined }}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: value > 0 ? color : undefined }}>
        {value.toLocaleString()}
      </p>
    </div>
  );
}

/** Colour-coded wording for the Status column. */
function StatusChip({ status }: { status: StockStatus }) {
  const styles: Record<StockStatus, string> = {
    healthy: "text-[var(--accent)]",
    understocked: "text-[var(--warn)]",
    overstocked: "text-[var(--over)]",
    expiring_soon: "text-[var(--warn)]",
    expired: "text-[var(--danger)]",
    out_of_stock: "text-[var(--danger)]",
  };
  const labels: Record<StockStatus, string> = {
    healthy: "healthy",
    understocked: "understocked",
    overstocked: "overstocked",
    expiring_soon: "expiring soon",
    expired: "expired",
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
