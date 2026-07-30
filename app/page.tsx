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
 *   5) Curated stock report (only after Display) — Generate report asks Google
 *      Gemini for a readable weekly narrative (classifications, outliers, charts)
 *      using the staged raw CSV + the transformed batches on screen
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
 * - List columns show Quantity in Stock and Quantity Sold (liters/kg). On-hand
 *   stock drives sold-out / overstock / understocked (Minimum Stock Threshold).
 *   Sold-cover restock-soon is switched off — search "SOLD-COVER DRIVER" in
 *   lib/inventory.ts (and optionally restore the chip label below).
 * - Badge numbers come from summarizeBatchStatusCounts via /api/inventory/transform
 *   (batch counts, not alert-message counts). "Need action" is the morning aggregate.
 * - Clicking a badge sets the inventory list filter (applyBadgeFilter) without scrolling.
 * - Item status chips under the badges are switched off — search "ITEM STATUS CHIPS".
 * - Department data sync panel is commented out on main — not shown in this load-first UI.
 * - Report success/error banners also appear in the Curated inventory report section
 *   once data is displayed; staging messages stay in the load section.
 * - Generate report needs GEMINI_API_KEY in `.env.local` (see `.env.example`).
 *   The key stays on the server — never add NEXT_PUBLIC_ in front of it.
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
  /* SOLD-COVER DRIVER (SWITCHED OFF) — re-enable with restockSoon chip logic below.
  isBelowMinimumStock,
  needsRestockSoon,
  */
  type ActionFilter,
  type ExpirationStatus,
  /* ITEM STATUS CHIPS (SWITCHED OFF) — type for the commented chip strip below.
  type InventoryAlert,
  */
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

/** Severity colours used by AI classifications / outliers. */
type AiSeverity = "critical" | "high" | "medium" | "low" | "ok";

type AiChartBar = { label: string; value: number };

/**
 * Shape of the AI narrative block from /api/report.
 * HOW TO MAINTAIN: field names must stay in sync with lib/ai-report.ts.
 */
type AiNarrative = {
  headline: string;
  weekNarrative: string;
  executiveSummary: string;
  classifications: {
    label: string;
    count: number;
    meaning: string;
    severity: AiSeverity;
  }[];
  outliers: {
    name: string;
    location: string;
    why: string;
    action: string;
    severity: AiSeverity;
  }[];
  chartData: {
    stockStatus: AiChartBar[];
    expirationStatus: AiChartBar[];
    actionMix: AiChartBar[];
  };
  recommendations: { priority: number; title: string; detail: string }[];
  supplierNotes: string[];
};

type ReportResponse = StockReport & {
  lineTotal?: number;
  alertTotal?: number;
  ai?: AiNarrative;
  aiMeta?: {
    source: "gemini" | "fallback";
    model: string | null;
    accountLabel: string | null;
    warning?: string;
  };
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
  const [reporting, setReporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ReportResponse | null>(null);

  /** Anchor for "scroll badges to the top" after Display. */
  const badgesRef = useRef<HTMLElement | null>(null);
  /** Anchor for "scroll report section to the top" after Generate report. */
  const reportSectionRef = useRef<HTMLElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * Smooth-scrolls a section to the top of the viewport after React paints it.
   * Pass a getter (or read a ref inside) so newly mounted targets — like the
   * badge strip after Display — are found after the commit, not before.
   * Two animation frames wait for that paint.
   */
  function scrollSectionToTop(getTarget: () => HTMLElement | null) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        getTarget()?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

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
    /* ITEM STATUS CHIPS (SWITCHED OFF)
    setAlerts([]);
    setAlertTotal(0);
    */
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
      /* ITEM STATUS CHIPS (SWITCHED OFF)
      setAlerts([]);
      setAlertTotal(0);
      */
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
      /* ITEM STATUS CHIPS (SWITCHED OFF)
      setAlerts([]);
      setAlertTotal(0);
      */
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
   * so the alert badge strip sits at the top of the viewport.
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
      /* ITEM STATUS CHIPS (SWITCHED OFF)
      setAlerts(data.alerts ?? []);
      setAlertTotal(data.alertTotal ?? (data.alerts?.length ?? 0));
      */
      setAlertCounts({ ...EMPTY_COUNTS, ...(data.alertCounts ?? {}) });
      setPage(1);
      setActionFilter("needs_action");
      setReport(null);
      setDataDisplayed(true);
      setMessage(
        `Showing ${(data.count ?? 0).toLocaleString()} batches from ${stagedLabel ?? "CSV"}.`
      );
      scrollSectionToTop(() => badgesRef.current);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to display inventory.");
    } finally {
      setTransforming(false);
    }
  }

  /**
   * Asks the server for a curated AI report from the batches on screen.
   * Sends the staged raw CSV text too, so Gemini sees both raw + transformed data
   * even when the file was dropped from the device (not only the on-disk CSV).
   * Credentials stay on the server — this browser call never includes the API key.
   * After success, scrolls so the report section sits at the top.
   */
  async function generateReport() {
    if (inventory.length === 0) return;
    setReporting(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: inventory,
          // Staged file text = the RAW digest for Gemini (optional but preferred).
          csvText: stagedCsvText ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Failed to generate report.");
      const payload = data as ReportResponse;
      setReport(payload);
      if (payload.aiMeta?.source === "gemini") {
        setMessage("AI curated inventory report ready for the operations manager.");
      } else {
        setMessage(
          payload.aiMeta?.warning ??
            "Rules-based inventory report ready (AI key not used)."
        );
      }
      scrollSectionToTop(() => reportSectionRef.current);
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
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Load a dairy inventory CSV, then display what needs attention today —
            low stock, upcoming expirations, and reorder candidates.
          </p>
          {/*
            STATUS LINE — Today's Date (APP_REFERENCE_DATE), expiring window,
            and how many batches need action once inventory is displayed.
          */}
          <p id="todays-date" className="mt-2 text-[var(--muted)]">
            <span className="font-bold">Today&apos;s Date</span>:{" "}
            <span className="font-mono">{referenceDate}</span>
            {" · "}
            expiring window: {EXPIRING_SOON_DAYS} days
            {dataDisplayed ? (
              <>
                {" · "}
                <span className="font-bold">{needsActionCount.toLocaleString()}</span>{" "}
                batches need action
              </>
            ) : (
              " · load a CSV to begin"
            )}
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

        {/* Staging / load feedback — report section owns banners after Display. */}
        {!dataDisplayed && message && (
          <p className="mt-4 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-2 text-sm">
            {message}
          </p>
        )}
        {!dataDisplayed && error && (
          <p className="mt-4 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-2 text-sm">
            {error}
          </p>
        )}
      </section>

      {/* ---- Alerts + inventory: only after Display ---- */}
      {dataDisplayed ? (
        <>
          {/*
            ALERT BADGES — batch counts from summarizeBatchStatusCounts.
            Need action first; Overstocked badge switched off; chips switched off.
            Click a badge to set the Show filter (no page scroll).
          */}
          <section
            ref={badgesRef}
            id="inventory-alerts"
            aria-label="Inventory alerts"
            className="anim-rise anim-rise-delay-1 mb-6 scroll-mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
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
            Uncomment with alerts / alertTotal state + InventoryAlert import.
          */}

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
                <table className="w-full min-w-[1100px] border-collapse text-sm">
                  <thead className="table-head sticky top-0 text-left text-[var(--muted)]">
                    <tr>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Location</th>
                      <th className="px-4 py-3 font-medium">Sales Channel</th>
                      <th className="px-4 py-3 font-medium">Storage Conditions</th>
                      <th className="px-4 py-3 text-right font-medium">
                        Quantity in Stock (liters/kg)
                      </th>
                      <th className="px-4 py-3 text-right font-medium">
                        Quantity Sold (liters/kg)
                      </th>
                      <th className="px-4 py-3 font-medium">Expiration</th>
                      <th className="px-4 py-3 font-medium">Expiration Status</th>
                      <th className="px-4 py-3 font-medium">Stock Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-10 text-center text-[var(--muted)]">
                          No matching batches. Try “All batches” or clear the search.
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((item) => {
                        const expirationStatus = classifyExpirationStatus(item);
                        const stockStatus = classifyStockStatus(item);
                        /* SOLD-COVER DRIVER (SWITCHED OFF) — "restock soon" chip label.
                        const restockSoon =
                          stockStatus === "understocked" &&
                          needsRestockSoon(item) &&
                          !isBelowMinimumStock(item);
                        */
                        return (
                          <tr
                            key={item.batchKey}
                            className="row-divider hover:bg-[var(--hover-fill)]"
                          >
                            <td
                              className="px-4 py-3 font-medium"
                              title={`${item.sourceRowCount.toLocaleString()} dataset row(s) · reorder ${formatUnits(item.reorderQuantity)} · min ${formatUnits(item.minimumStockThreshold)} · listed ${formatUnits(item.listedQuantity)}`}
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
                            <td className="px-4 py-3 text-right tabular-nums">
                              {formatUnits(item.quantitySold)}
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
            CURATED INVENTORY REPORT (AI + rules)
            WHAT THE USER SEES after Display:
            Click Generate report → server uses staged raw CSV + on-screen batches,
            asks Google Gemini for a manager-friendly write-up, then this section
            shows headline, classifications, charts, outliers, recommendations,
            supplier notes, and the urgent batch table (In stock / Sold columns).

            HOW TO MAINTAIN:
            - Button label / blurb: edit the <h2> and <p> below.
            - Gemini setup: GEMINI_API_USERNAME + GEMINI_API_KEY in `.env.local`.
            - Chart colours: severityColor / BarChartCard helpers at file bottom.
          */}
          <section
            ref={reportSectionRef}
            id="inventory-report"
            aria-label="Generate inventory report"
            className="mb-10 scroll-mt-6"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-display text-xl font-semibold">Curated inventory report</h2>
                <p className="text-sm text-[var(--muted)]">
                  AI weekly status for FreshRoute&apos;s operations manager — stock risk,
                  shelf-life outliers, and supplier next steps from the batches on screen.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void generateReport()}
                disabled={reporting || inventory.length === 0}
                className="rounded-lg bg-[var(--accent-strong)] px-5 py-2.5 text-sm font-semibold text-[var(--accent-contrast)] transition hover:bg-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {reporting ? "Generating with AI…" : "Generate report"}
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
                className="mt-5 space-y-6 rounded-[18px] border border-[var(--panel-border)] bg-[var(--panel)] p-5"
                data-testid="report"
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted)]">
                    Generated {new Date(report.generatedAt).toLocaleString()}
                    {" · "}
                    Today&apos;s Date {report.referenceDate}
                    {report.aiMeta?.source === "gemini" && report.aiMeta.model
                      ? ` · AI ${report.aiMeta.model}`
                      : " · rules-based draft"}
                  </p>
                  {report.ai?.headline && (
                    <h3 className="mt-3 font-display text-2xl font-semibold text-[var(--foreground)]">
                      {report.ai.headline}
                    </h3>
                  )}
                  <p className="mt-3 text-[var(--foreground)]">
                    {report.ai?.weekNarrative ?? report.summary}
                  </p>
                  {report.ai?.executiveSummary &&
                    report.ai.executiveSummary !== report.ai.weekNarrative && (
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        {report.ai.executiveSummary}
                      </p>
                    )}
                  {report.aiMeta?.warning && (
                    <p className="mt-3 rounded-lg border border-[var(--warn)]/35 bg-[var(--warn)]/10 px-3 py-2 text-sm text-[var(--foreground)]">
                      {report.aiMeta.warning}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <MiniStat label="Batches" value={report.totals.itemCount} />
                  <MiniStat label="Units" value={report.totals.totalUnits} />
                  <MiniStat label="Need action" value={report.totals.needsActionCount} />
                  <MiniStat
                    label="Shelf risk"
                    value={report.totals.expiringSoonCount + report.totals.expiredCount}
                  />
                </div>

                {report.ai?.classifications && report.ai.classifications.length > 0 && (
                  <div>
                    <h3 className="font-medium">Classifications</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      How today&apos;s batches group for a quick scan.
                    </p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {report.ai.classifications.map((item) => (
                        <div
                          key={`${item.label}-${item.count}`}
                          className="rounded-xl border border-[var(--panel-border)] bg-[var(--surface)] px-3 py-3"
                          style={{
                            borderColor: `color-mix(in srgb, ${severityColor(item.severity)} 45%, transparent)`,
                          }}
                        >
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                              {item.label}
                            </p>
                            <p
                              className="text-lg font-semibold tabular-nums"
                              style={{ color: severityColor(item.severity) }}
                            >
                              {item.count.toLocaleString()}
                            </p>
                          </div>
                          <p className="mt-2 text-sm text-[var(--muted)]">{item.meaning}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {report.ai?.chartData && (
                  <div>
                    <h3 className="font-medium">Graphics</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Batch counts by stock health, shelf life, and action mix.
                    </p>
                    <div className="mt-3 grid gap-4 lg:grid-cols-3">
                      <BarChartCard
                        title="Stock status"
                        bars={report.ai.chartData.stockStatus}
                      />
                      <BarChartCard
                        title="Expiration status"
                        bars={report.ai.chartData.expirationStatus}
                      />
                      <BarChartCard
                        title="Action mix"
                        bars={report.ai.chartData.actionMix}
                      />
                    </div>
                  </div>
                )}

                {report.ai?.outliers && report.ai.outliers.length > 0 && (
                  <div>
                    <h3 className="font-medium">Outliers to watch</h3>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                      Batches that stand out from the rest of the week.
                    </p>
                    <ul className="mt-3 space-y-3">
                      {report.ai.outliers.map((item) => (
                        <li
                          key={`${item.name}-${item.location}-${item.why}`}
                          className="rounded-xl border border-[var(--panel-border)] bg-[var(--surface)] px-4 py-3"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="font-medium text-[var(--foreground)]">
                              {item.name}
                              <span className="text-[var(--muted)]"> · {item.location}</span>
                            </p>
                            <span
                              className="text-[11px] uppercase tracking-[0.12em]"
                              style={{ color: severityColor(item.severity) }}
                            >
                              {item.severity}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-[var(--muted)]">{item.why}</p>
                          <p className="mt-2 text-sm text-[var(--foreground)]">
                            <span className="text-[var(--muted)]">Next step: </span>
                            {item.action}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <h3 className="font-medium">Recommendations</h3>
                  <ul className="mt-2 list-none space-y-2">
                    {(report.ai?.recommendations?.length
                      ? report.ai.recommendations
                      : report.recommendations.map((detail, index) => ({
                          priority: index + 1,
                          title: `Step ${index + 1}`,
                          detail,
                        }))
                    ).map((tip) => (
                      <li
                        key={`${tip.priority}-${tip.title}`}
                        className="rounded-lg border border-[var(--panel-border)] bg-[var(--surface-soft)] px-3 py-2 text-sm"
                      >
                        <p className="font-medium text-[var(--foreground)]">
                          {tip.priority}. {tip.title}
                        </p>
                        <p className="mt-1 text-[var(--muted)]">{tip.detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>

                {report.ai?.supplierNotes && report.ai.supplierNotes.length > 0 && (
                  <div>
                    <h3 className="font-medium">Supplier &amp; farm notes</h3>
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                      {report.ai.supplierNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <p className="text-xs text-[var(--muted)]">
                    Most urgent batches first — showing{" "}
                    {Math.min(REPORT_ROW_LIMIT, report.lines.length).toLocaleString()} of{" "}
                    {(report.lineTotal ?? report.lines.length).toLocaleString()} batches.
                  </p>

                  <div className="mt-2 overflow-x-auto rounded-xl border border-[var(--panel-border)]">
                    <table className="w-full min-w-[960px] border-collapse text-sm">
                      <thead className="bg-[var(--surface-soft)] text-left text-[var(--muted)]">
                        <tr>
                          <th className="px-3 py-2 font-medium">Name</th>
                          <th className="px-3 py-2 font-medium">Location</th>
                          <th className="px-3 py-2 font-medium">Channel</th>
                          <th className="px-3 py-2 text-right font-medium">In stock</th>
                          <th className="px-3 py-2 text-right font-medium">Sold</th>
                          <th className="px-3 py-2 font-medium">Expiration</th>
                          <th className="px-3 py-2 font-medium">Expiration Status</th>
                          <th className="px-3 py-2 font-medium">Stock Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.lines.slice(0, REPORT_ROW_LIMIT).map((line) => {
                          /* SOLD-COVER DRIVER (SWITCHED OFF) — "restock soon" chip label.
                          const restockSoon =
                            line.stockStatus === "understocked" &&
                            needsRestockSoon(line) &&
                            !isBelowMinimumStock(line);
                          */
                          return (
                            <tr key={line.batchKey} className="row-divider">
                              <td className="px-3 py-2">{line.name}</td>
                              <td className="px-3 py-2">{line.location}</td>
                              <td className="px-3 py-2">{line.salesChannel}</td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatUnits(line.quantity)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">
                                {formatUnits(line.quantitySold)}
                              </td>
                              <td className="px-3 py-2">{line.expirationDate}</td>
                              <td className="px-3 py-2">
                                <ExpirationChip status={line.expirationStatus} />
                              </td>
                              <td className="px-3 py-2">
                                <StockChip status={line.stockStatus} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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

/**
 * One coloured summary badge in the morning overview strip.
 * Clicking applies the matching Show filter (see applyBadgeFilter).
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
function StockChip({
  status,
  /* SOLD-COVER DRIVER (SWITCHED OFF) — pass restockSoon to show that label.
  restockSoon,
  */
}: {
  status: StockStatus;
  /* SOLD-COVER DRIVER (SWITCHED OFF)
  restockSoon?: boolean;
  */
}) {
  const styles: Record<StockStatus, string> = {
    healthy: "text-[var(--accent)]",
    understocked: "text-[var(--warn)]",
    overstocked: "text-[var(--over)]",
    out_of_stock: "text-[var(--danger)]",
  };
  const labels: Record<StockStatus, string> = {
    healthy: "healthy",
    understocked: "understocked",
    // SOLD-COVER DRIVER (SWITCHED OFF): understocked: restockSoon ? "restock soon" : "understocked",
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

/**
 * Maps AI severity words to theme colours.
 * HOW TO MAINTAIN: change these only if the palette in globals.css changes.
 */
function severityColor(severity: AiSeverity): string {
  switch (severity) {
    case "critical":
      return "var(--danger)";
    case "high":
      return "var(--warn)";
    case "medium":
      return "var(--over)";
    case "low":
      return "var(--info)";
    case "ok":
    default:
      return "var(--accent)";
  }
}

/**
 * One horizontal bar chart card inside the curated report Graphics section.
 * WHAT THE USER SEES: a title plus labelled bars scaled to the largest value.
 * HOW TO MAINTAIN: pass different `bars` from the AI chartData; no chart library.
 */
function BarChartCard({ title, bars }: { title: string; bars: AiChartBar[] }) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <div className="rounded-xl border border-[var(--panel-border)] bg-[var(--surface)] p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-[var(--muted)]">{title}</p>
      <ul className="mt-3 space-y-2.5">
        {bars.map((bar) => {
          const widthPct = Math.max(4, Math.round((bar.value / max) * 100));
          return (
            <li key={`${title}-${bar.label}`}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-[var(--foreground)]">{bar.label}</span>
                <span className="tabular-nums text-[var(--muted)]">
                  {bar.value.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded bg-[var(--surface-soft)]">
                <div
                  className="h-full rounded bg-[var(--accent)] transition-[width] duration-500"
                  style={{ width: `${widthPct}%` }}
                  aria-hidden
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
