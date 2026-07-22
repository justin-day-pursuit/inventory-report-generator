/**
 * ============================================================================
 * MAIN MONITORING PAGE (app/page.tsx)
 * ============================================================================
 * WHAT THIS PAGE IS FOR:
 * Day-to-day inventory coordinator workspace. Top-to-bottom layout:
 *   1) Alert summary cards (out of stock, understocked, overstocked, expiring)
 *   2) Inventory list container with sticky search/filter + its own scroll/pager
 *   3) Load / check sales & incoming supplies, then Update inventory
 *   4) Generate a curated stock report
 *
 * HOW TO MAINTAIN (non-technical):
 * - Product rows come from data/inventory/inventory.json via /api/inventory.
 * - Sales rows come from data/sales/sales.json via /api/sales.
 * - Incoming rows come from data/incoming/incoming.json via /api/incoming.
 * - To change how many rows appear per page, edit PAGE_SIZE near the top.
 * - Button labels can be reworded carefully; keep the onClick handlers attached.
 * ============================================================================
 */

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  classifyStatus,
  filterInventory,
  type IncomingItem,
  type InventoryAlert,
  type InventoryItem,
  type SalesItem,
  type StockReport,
  type StockStatus,
} from "@/lib/inventory";

/** How many inventory rows show on one page inside the list container. */
const PAGE_SIZE = 6;

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

export default function Home() {
  /* ---------- Inventory display state ---------- */
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [alertCounts, setAlertCounts] = useState<AlertCounts>(EMPTY_COUNTS);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | StockStatus>("all");
  const [page, setPage] = useState(1);

  /* ---------- Department feeds (loaded via API) ---------- */
  const [sales, setSales] = useState<SalesItem[] | null>(null);
  const [incoming, setIncoming] = useState<IncomingItem[] | null>(null);

  /* ---------- UI status messages ---------- */
  const [loadingInventory, setLoadingInventory] = useState(true);
  const [loadingSales, setLoadingSales] = useState(false);
  const [loadingIncoming, setLoadingIncoming] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<StockReport | null>(null);

  /* ---------- Initial load of current inventory ---------- */
  useEffect(() => {
    void refreshInventory();
  }, []);

  /** Fetches current stock + alert badges from /api/inventory. */
  async function refreshInventory() {
    setLoadingInventory(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load inventory.");
      setInventory(data.items ?? []);
      setAlerts(data.alerts ?? []);
      setAlertCounts(data.alertCounts ?? EMPTY_COUNTS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inventory.");
    } finally {
      setLoadingInventory(false);
    }
  }

  /** API call: load sales feed into memory (does not change inventory yet). */
  async function loadSales() {
    setLoadingSales(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/sales");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load sales.");
      setSales(data.items ?? []);
      setMessage(`Loaded ${data.count ?? 0} sales row(s) from ${data.source}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load sales.");
    } finally {
      setLoadingSales(false);
    }
  }

  /** API call: load incoming supplies into memory (does not change inventory yet). */
  async function loadIncoming() {
    setLoadingIncoming(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/incoming");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load incoming supplies.");
      setIncoming(data.items ?? []);
      setMessage(`Loaded ${data.count ?? 0} incoming row(s) from ${data.source}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load incoming supplies.");
    } finally {
      setLoadingIncoming(false);
    }
  }

  /**
   * Opens the read-only sales list in a new browser tab.
   * MAINTENANCE: Path must match app/check/sales/page.tsx.
   */
  function checkSales() {
    window.open("/check/sales", "_blank", "noopener,noreferrer");
  }

  /**
   * Opens the read-only incoming supplies list in a new browser tab.
   * MAINTENANCE: Path must match app/check/incoming/page.tsx.
   */
  function checkIncoming() {
    window.open("/check/incoming", "_blank", "noopener,noreferrer");
  }

  /**
   * Applies loaded sales (−) and incoming supplies (+) to inventory,
   * saves the result to data/inventory/inventory.json, and refreshes the list.
   */
  async function updateInventory() {
    setUpdating(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/inventory/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sales: sales ?? undefined,
          incoming: incoming ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to update inventory.");
      setInventory(data.items ?? []);
      setAlerts(data.alerts ?? []);
      setAlertCounts(data.alertCounts ?? EMPTY_COUNTS);
      setPage(1);
      setMessage(
        `Inventory updated using ${data.applied?.incomingRows ?? 0} incoming and ${data.applied?.salesRows ?? 0} sales row(s).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update inventory.");
    } finally {
      setUpdating(false);
    }
  }

  /** Asks the API to build a curated report from the currently displayed stock. */
  async function generateReport() {
    setReporting(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: inventory }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to generate report.");
      setReport(data as StockReport);
      setMessage("Curated inventory report ready — scroll down to review.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report.");
    } finally {
      setReporting(false);
    }
  }

  /* ---------- Search / filter / pagination (list-only; toolbar stays put) ---------- */
  const filtered = useMemo(
    () => filterInventory(inventory, search, statusFilter),
    [inventory, search, statusFilter]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamp the page if filters shrink the result set (avoids an extra effect).
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <main className="mx-auto max-w-6xl px-5 py-8 sm:py-12">
      {/* ---- Brand / page intro (one composition, brand-forward) ---- */}
      <header className="anim-rise mb-8">
        <p className="text-sm font-medium uppercase tracking-[0.22em] text-[var(--accent)]">
          Warehouse ops
        </p>
        <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
          Stockflow
        </h1>
        <p className="mt-3 max-w-2xl text-[var(--muted)]">
          Monitor live stock, pull sales and supply feeds, and generate an accurate
          restock report without retyping department data by hand.
        </p>
      </header>

      {/* ---- Alert badges / summary cards ---- */}
      <section
        aria-label="Inventory alerts"
        className="anim-rise anim-rise-delay-1 mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"
      >
        <AlertCard
          label="Out of stock"
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
          {alerts.slice(0, 8).map((alert) => (
            <span
              key={`${alert.kind}-${alert.sku}-${alert.message}`}
              className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-[var(--muted)]"
              title={alert.message}
            >
              <strong className="text-[var(--foreground)]">{alert.sku}</strong> · {alert.kind.replaceAll("_", " ")}
            </span>
          ))}
          {alerts.length > 8 && (
            <span className="px-2.5 py-1 text-xs text-[var(--muted)]">
              +{alerts.length - 8} more
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
                : `${filtered.length} of ${inventory.length} SKUs shown`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshInventory()}
            className="rounded-lg border border-white/15 px-3 py-2 text-sm text-[var(--muted)] transition hover:bg-white/5 hover:text-[var(--foreground)]"
          >
            Refresh
          </button>
        </div>

        <div className="inventory-shell">
          {/* Sticky toolbar — does NOT scroll away with the table body */}
          <div className="inventory-toolbar">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative block min-w-0 flex-1">
                <span className="sr-only">Search inventory</span>
                <input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search SKU, name, or storage…"
                  className="w-full rounded-lg border border-white/10 bg-[#0b1613] px-3 py-2.5 text-sm outline-none ring-[var(--accent)]/40 placeholder:text-[var(--muted)] focus:ring-2"
                />
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
                <span className="whitespace-nowrap">Filter</span>
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value as "all" | StockStatus);
                    setPage(1);
                  }}
                  className="rounded-lg border border-white/10 bg-[#0b1613] px-3 py-2.5 text-sm text-[var(--foreground)] outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
                >
                  <option value="all">All statuses</option>
                  <option value="healthy">Healthy</option>
                  <option value="understocked">Understocked</option>
                  <option value="overstocked">Overstocked</option>
                  <option value="expiring_soon">Expiring soon</option>
                  <option value="expired">Expired</option>
                  <option value="out_of_stock">Out of stock</option>
                </select>
              </label>
            </div>
          </div>

          {/* Scrollable table body only */}
          <div className="inventory-scroll">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead className="sticky top-0 bg-[#10201b] text-left text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 text-right font-medium">Quantity</th>
                  <th className="px-4 py-3 font-medium">Expiration</th>
                  <th className="px-4 py-3 text-right font-medium">Rate of sale</th>
                  <th className="px-4 py-3 font-medium">Storage requirements</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[var(--muted)]">
                      {loadingInventory
                        ? "Loading…"
                        : "No matching products. Clear search/filter or add rows to data/inventory/inventory.json."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((item) => {
                    const status = classifyStatus(item);
                    return (
                      <tr key={item.sku} className="border-t border-white/5 hover:bg-white/[0.03]">
                        <td className="font-mono px-4 py-3 text-[var(--muted)]">{item.sku}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{item.name}</div>
                          <StatusChip status={status} />
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                        <td className="px-4 py-3">{item.expiration}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {item.rateOfSale}
                          <span className="text-[var(--muted)]"> /day</span>
                        </td>
                        <td className="px-4 py-3 text-[var(--muted)]">{item.storageRequirements}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Page navigation stays pinned under the scroll area */}
          <div className="inventory-pager">
            <p className="text-xs text-[var(--muted)]">
              Page {safePage} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-md border border-white/15 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-md border border-white/15 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Sales / supplies integration controls ---- */}
      <section
        aria-label="Sync sales and supplies"
        className="anim-rise anim-rise-delay-3 mb-8 rounded-[18px] border border-[var(--panel-border)] bg-[var(--panel)] p-5 backdrop-blur"
      >
        <h2 className="font-display text-xl font-semibold">Department data sync</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          Load mock API feeds from the sales and receiving folders, open a check tab to
          review rows, then update the displayed inventory (supplies added, sales subtracted).
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {/* Sales column */}
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <h3 className="font-medium">Sales data</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Source: <code className="font-mono">data/sales/sales.json</code>
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {sales
                ? `${sales.length} row(s) loaded in memory`
                : "Not loaded yet — press Load before updating, or Update will read the file directly."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadSales()}
                disabled={loadingSales}
                className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-[#04140f] transition hover:bg-[var(--accent-strong)] hover:text-white disabled:opacity-60"
              >
                {loadingSales ? "Loading…" : "Load sales data"}
              </button>
              <button
                type="button"
                onClick={checkSales}
                className="rounded-lg border border-white/15 px-3.5 py-2 text-sm transition hover:bg-white/5"
              >
                Check sales data
              </button>
            </div>
          </div>

          {/* Incoming column */}
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <h3 className="font-medium">Incoming supplies</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Source: <code className="font-mono">data/incoming/incoming.json</code>
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {incoming
                ? `${incoming.length} row(s) loaded in memory`
                : "Not loaded yet — press Load before updating, or Update will read the file directly."}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadIncoming()}
                disabled={loadingIncoming}
                className="rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-[#04140f] transition hover:bg-[var(--accent-strong)] hover:text-white disabled:opacity-60"
              >
                {loadingIncoming ? "Loading…" : "Load incoming supplies"}
              </button>
              <button
                type="button"
                onClick={checkIncoming}
                className="rounded-lg border border-white/15 px-3.5 py-2 text-sm transition hover:bg-white/5"
              >
                Check incoming supplies
              </button>
            </div>
          </div>

          {/* Update column */}
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <h3 className="font-medium">Update inventory</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Writes to <code className="font-mono">data/inventory/inventory.json</code>
            </p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Adds incoming quantities, then subtracts sales. New SKUs in incoming become
              new inventory rows.
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => void updateInventory()}
                disabled={updating}
                className="rounded-lg bg-[var(--info)] px-3.5 py-2 text-sm font-medium text-white transition hover:brightness-110 disabled:opacity-60"
              >
                {updating ? "Updating…" : "Update current inventory"}
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
              Cross-checks thresholds, expiration, and rate-of-sale trends for supplier follow-up.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void generateReport()}
            disabled={reporting || inventory.length === 0}
            className="rounded-lg bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
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
              <MiniStat label="SKUs" value={report.totals.itemCount} />
              <MiniStat label="Units" value={report.totals.totalUnits} />
              <MiniStat label="Need reorder" value={report.totals.outOfStockCount + report.totals.understockedCount} />
              <MiniStat label="Shelf risk" value={report.totals.expiringSoonCount + report.totals.expiredCount} />
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead className="bg-white/5 text-left text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 text-right font-medium">Days to expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lines.map((line) => (
                    <tr key={line.sku} className="border-t border-white/5">
                      <td className="font-mono px-3 py-2 text-[var(--muted)]">{line.sku}</td>
                      <td className="px-3 py-2">{line.name}</td>
                      <td className="px-3 py-2 text-right">{line.quantity}</td>
                      <td className="px-3 py-2">
                        <StatusChip status={line.status} />
                      </td>
                      <td className="px-3 py-2 text-right">{line.daysUntilExpiration}</td>
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
      className={`rounded-xl border border-white/10 bg-black/25 px-4 py-3 ${pulse ? "alert-pulse" : ""}`}
      style={{ borderColor: value > 0 ? `color-mix(in srgb, ${color} 45%, transparent)` : undefined }}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: value > 0 ? color : undefined }}>
        {value}
      </p>
    </div>
  );
}

function StatusChip({ status }: { status: StockStatus }) {
  const styles: Record<StockStatus, string> = {
    healthy: "text-[var(--accent)]",
    understocked: "text-[var(--warn)]",
    overstocked: "text-[var(--over)]",
    expiring_soon: "text-[var(--warn)]",
    expired: "text-[var(--danger)]",
    out_of_stock: "text-[var(--danger)]",
  };
  return (
    <span className={`text-xs ${styles[status]}`}>{status.replaceAll("_", " ")}</span>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value.toLocaleString()}</p>
    </div>
  );
}
