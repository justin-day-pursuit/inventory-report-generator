/**
 * ============================================================================
 * MAIN MONITORING PAGE (app/page.tsx)
 * ============================================================================
 * WHAT THIS PAGE IS FOR:
 * Load-first workbench for the inventory coordinator. Top-to-bottom:
 *   1) Brand header + today's status-clock date
 *   2) Load a dairy CSV (drag-and-drop from the device, or load the codebase file)
 *   3) Display button — appears only after a CSV is staged; runs the batch transform
 *   4) Alert cards + inventory batches (only after Display)
 *   5) Curated stock report (only after Display)
 *
 * START / REFRESH RULE:
 * On first paint and whenever Refresh is pressed, all staged CSV text and all
 * displayed inventory / alerts / report are cleared. The coordinator must load
 * a file again before anything shows.
 *
 * TRANSFORM:
 * Display posts the staged CSV to /api/inventory/transform, which groups rows by
 * Location + Product Name + Brand + Storage Condition + Sales Channel — the same
 * rules used for the on-disk inventory.csv.
 *
 * HOW TO MAINTAIN:
 * - DEFAULT_PAGE_SIZE / PAGE_SIZE_OPTIONS control how many rows show per page.
 * - The department sync buttons stay inert (search "SWITCHED OFF").
 * ============================================================================
 */

"use client";

import { useMemo, useRef, useState, type DragEvent } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  APP_REFERENCE_DATE,
  EXPIRING_SOON_DAYS,
  classifyExpirationStatus,
  classifyStockStatus,
  filterInventory,
  type ActionFilter,
  type ExpirationStatus,
  type InventoryAlert,
  type InventoryItem,
  type StockReport,
  type StockStatus,
} from "@/lib/inventory";

/** How many batch rows show on one page when the list first appears. */
const DEFAULT_PAGE_SIZE = 50;

/** Choices offered in the "Rows" dropdown above the table. */
const PAGE_SIZE_OPTIONS = [25, 50, 100, 250, 500];

/** How many report rows to list under the curated report. */
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

type ReportResponse = StockReport & {
  lineTotal?: number;
  alertTotal?: number;
};

/** Shows a stock figure with thousands separators and at most two decimals. */
function formatUnits(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

/** Formats a byte count for the staged-file caption under the drop zone. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function Home() {
  /* ---------- Staged CSV (loaded but not yet displayed) ---------- */
  const [stagedCsvText, setStagedCsvText] = useState<string | null>(null);
  const [stagedLabel, setStagedLabel] = useState<string | null>(null);
  const [stagedBytes, setStagedBytes] = useState(0);
  const [loadingSource, setLoadingSource] = useState(false);
  const [transforming, setTransforming] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  /* ---------- Displayed inventory (only after Display) ---------- */
  const [dataDisplayed, setDataDisplayed] = useState(false);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [sourceRecordCount, setSourceRecordCount] = useState(0);
  const [referenceDate, setReferenceDate] = useState(APP_REFERENCE_DATE);
  const [alerts, setAlerts] = useState<InventoryAlert[]>([]);
  const [alertTotal, setAlertTotal] = useState(0);
  const [alertCounts, setAlertCounts] = useState<AlertCounts>(EMPTY_COUNTS);
  const [search, setSearch] = useState("");
  /** Default morning view: only batches that need a decision today. */
  const [actionFilter, setActionFilter] = useState<ActionFilter>("needs_action");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  /* ---------- UI status messages ---------- */
  const [reporting, setReporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);

  /** Anchor for "scroll today's date to the top" after Display. */
  const todaysDateRef = useRef<HTMLParagraphElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Clears staged CSV and every displayed result.
   * Called on first paint (via empty initial state), on Refresh, and whenever
   * the coordinator wants to start over. Does NOT fetch anything.
   */
  function clearWorkspace() {
    setStagedCsvText(null);
    setStagedLabel(null);
    setStagedBytes(0);
    setDragActive(false);
    setDataDisplayed(false);
    setInventory([]);
    setSourceRecordCount(0);
    setReferenceDate(APP_REFERENCE_DATE);
    setAlerts([]);
    setAlertTotal(0);
    setAlertCounts(EMPTY_COUNTS);
    setSearch("");
    setActionFilter("needs_action");
    setPage(1);
    setReport(null);
    setMessage(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /**
   * Stages a CSV file chosen from the device (drop or file picker).
   * The inventory list stays empty until Display is pressed.
   */
  async function stageDeviceFile(file: File | null | undefined) {
    if (!file) return;
    setError(null);
    setMessage(null);
    const name = file.name || "upload.csv";
    if (!name.toLowerCase().endsWith(".csv") && file.type && !file.type.includes("csv")) {
      setError("Please choose a .csv file.");
      return;
    }
    try {
      const text = await file.text();
      if (!text.trim()) {
        setError("That file is empty.");
        return;
      }
      // Staging a new file clears any previous display so old badges cannot linger.
      setDataDisplayed(false);
      setInventory([]);
      setAlerts([]);
      setAlertTotal(0);
      setAlertCounts(EMPTY_COUNTS);
      setReport(null);
      setStagedCsvText(text);
      setStagedLabel(name);
      setStagedBytes(file.size || new Blob([text]).size);
      setMessage(`Loaded “${name}” — press Display inventory to transform and show it.`);
    } catch {
      setError("Could not read that file. Try another CSV.");
    }
  }

  /** Fetches data/inventory/inventory.csv from the server and stages it (no display yet). */
  async function loadFromCodebase() {
    setLoadingSource(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/inventory/source");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to load codebase CSV.");
      const text = typeof data.csvText === "string" ? data.csvText : "";
      if (!text.trim()) throw new Error("Codebase inventory CSV was empty.");
      setDataDisplayed(false);
      setInventory([]);
      setAlerts([]);
      setAlertTotal(0);
      setAlertCounts(EMPTY_COUNTS);
      setReport(null);
      setStagedCsvText(text);
      setStagedLabel(data.source ?? "data/inventory/inventory.csv");
      setStagedBytes(typeof data.bytes === "number" ? data.bytes : new Blob([text]).size);
      setMessage(
        `Loaded codebase file ${data.source ?? "inventory.csv"} — press Display inventory to transform and show it.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load codebase CSV.");
    } finally {
      setLoadingSource(false);
    }
  }

  /**
   * Transforms the staged CSV into batches + alerts, shows them, and scrolls
   * so the today's-date / status-clock line sits at the top of the viewport.
   */
  async function displayInventory() {
    if (!stagedCsvText) return;
    setTransforming(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/inventory/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csvText: stagedCsvText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to transform inventory.");
      setInventory(data.items ?? []);
      setSourceRecordCount(data.sourceRecordCount ?? 0);
      setReferenceDate(data.referenceDate ?? APP_REFERENCE_DATE);
      setAlerts(data.alerts ?? []);
      setAlertTotal(data.alertTotal ?? (data.alerts?.length ?? 0));
      setAlertCounts(data.alertCounts ?? EMPTY_COUNTS);
      setPage(1);
      setActionFilter("needs_action");
      setReport(null);
      setDataDisplayed(true);
      setMessage(
        `Showing ${(data.count ?? 0).toLocaleString()} batches from ${stagedLabel ?? "CSV"}.`
      );
      // Wait one frame so the date line is in the DOM, then pin it to the top.
      requestAnimationFrame(() => {
        todaysDateRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to display inventory.");
    } finally {
      setTransforming(false);
    }
  }

  /**
   * Builds a curated report from the batches currently on screen (not from disk),
   * so a dropped CSV gets the same report treatment as the codebase file.
   */
  async function generateReport() {
    if (inventory.length === 0) return;
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
      setReport(data as ReportResponse);
      setMessage("Curated inventory report ready — scroll down to review.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate report.");
    } finally {
      setReporting(false);
    }
  }

  /* ---------- Drag-and-drop handlers for the load zone ---------- */
  function onDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(true);
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    void stageDeviceFile(file);
  }

  /* ---------- Search / filter / pagination (list only) ---------- */
  const filtered = useMemo(
    () => (dataDisplayed ? filterInventory(inventory, search, actionFilter) : []),
    [inventory, search, actionFilter, dataDisplayed]
  );

  const needsActionCount = useMemo(
    () => (dataDisplayed ? filterInventory(inventory, "", "needs_action").length : 0),
    [inventory, dataDisplayed]
  );

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
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Load a dairy inventory CSV, then display what needs attention today —
            low stock, upcoming expirations, and reorder candidates.
          </p>
          {/* Today's date / status clock — scroll target after Display */}
          <p
            id="todays-date"
            ref={todaysDateRef}
            className="mt-2 scroll-mt-6 text-xs text-[var(--muted)]"
          >
            Today&apos;s date (status clock):{" "}
            <span className="font-mono text-[var(--foreground)]">{referenceDate}</span>
            {" · "}
            expiring window: {EXPIRING_SOON_DAYS} days
            {dataDisplayed
              ? ` · ${needsActionCount.toLocaleString()} batches need action`
              : " · load a CSV to begin"}
          </p>
        </div>
        <div className="shrink-0 sm:pt-1">
          <ThemeToggle />
        </div>
      </header>

      {/* ---- Load CSV (device drop or codebase file) ---- */}
      <section
        aria-label="Load inventory CSV"
        className="anim-rise anim-rise-delay-1 mb-8 rounded-[18px] border border-[var(--panel-border)] bg-[var(--panel)] p-5 backdrop-blur"
      >
        <h2 className="font-display text-xl font-semibold">Load inventory data</h2>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          Drop a dairy CSV from your device, or load the copy already in this project.
          Nothing is shown until you press Display inventory.
        </p>

        {/* Drop zone — same idea as Drive / Dropbox upload panels */}
        <div
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition ${
            dragActive
              ? "border-[var(--accent)] bg-[var(--accent)]/10"
              : "border-[var(--control-border)] bg-[var(--surface-soft)] hover:border-[var(--accent)]/60"
          }`}
        >
          <p className="text-sm font-medium text-[var(--foreground)]">
            Drag and drop a CSV here
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">or click to browse your device</p>
          <p className="mt-3 text-xs text-[var(--muted)]">Accepts .csv files only</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => {
              void stageDeviceFile(event.target.files?.[0]);
            }}
          />
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={() => void loadFromCodebase()}
            disabled={loadingSource}
            className="rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-contrast)] transition hover:bg-[var(--accent-strong)] disabled:opacity-60"
          >
            {loadingSource ? "Loading…" : "Load inventory from codebase"}
          </button>
          <button
            type="button"
            onClick={clearWorkspace}
            className="rounded-lg border border-[var(--control-border)] px-4 py-2.5 text-sm transition hover:bg-[var(--hover-fill)]"
          >
            Refresh
          </button>
        </div>

        {stagedCsvText && (
          <div className="mt-5 flex flex-col gap-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="font-medium text-[var(--foreground)]">Ready to display</p>
              <p className="truncate text-[var(--muted)]">
                {stagedLabel} · {formatBytes(stagedBytes)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void displayInventory()}
              disabled={transforming}
              className="shrink-0 rounded-lg bg-[var(--accent-strong)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--accent)] disabled:opacity-60"
            >
              {transforming ? "Transforming…" : "Display inventory"}
            </button>
          </div>
        )}

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

      {/* ---- Alerts + inventory: only after Display ---- */}
      {dataDisplayed ? (
        <>
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

          <section aria-label="Current inventory" className="anim-rise anim-rise-delay-2 mb-8">
            <div className="mb-3">
              <h2 className="font-display text-xl font-semibold">Inventory batches</h2>
              <p className="text-sm text-[var(--muted)]">
                {`${filtered.length.toLocaleString()} of ${inventory.length.toLocaleString()} batches shown`}
                {sourceRecordCount > 0
                  ? ` · grouped from ${sourceRecordCount.toLocaleString()} dataset rows`
                  : ""}
              </p>
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
                      <option value="needs_action">Needs action</option>
                      <option value="expired">Expired</option>
                      <option value="expiring_soon">Expiring soon</option>
                      <option value="out_of_stock">Sold out</option>
                      <option value="understocked">Understocked</option>
                      <option value="overstocked">Overstocked</option>
                      <option value="healthy">Healthy</option>
                      <option value="all">All batches</option>
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
                          No matching batches. Try “All batches” or clear the search.
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
                            <td className="px-4 py-3 text-[var(--muted)]">
                              {item.storageCondition}
                            </td>
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

          {/* ---- Report generation ---- */}
          <section aria-label="Generate inventory report" className="mb-10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold">Curated inventory report</h2>
                <p className="text-sm text-[var(--muted)]">
                  Weekly-style status report from the batches on screen — ready for the
                  operations manager.
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
        </>
      ) : (
        <section
          aria-label="Waiting for inventory"
          className="mb-10 rounded-[18px] border border-dashed border-[var(--panel-border)] px-6 py-14 text-center"
        >
          <p className="font-display text-lg font-semibold">No inventory on screen</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
            Load a CSV above, then press Display inventory. Alert badges and the batch
            list stay empty until then — including after Refresh or a full page reload.
          </p>
        </section>
      )}
    </main>
  );
}

/* -------------------------------------------------------------------------- */
/* Small presentational helpers                                               */
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
      style={{
        borderColor: value > 0 ? `color-mix(in srgb, ${color} 45%, transparent)` : undefined,
      }}
    >
      <p className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p
        className="mt-1 text-2xl font-semibold tabular-nums"
        style={{ color: value > 0 ? color : undefined }}
      >
        {value.toLocaleString()}
      </p>
    </div>
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
