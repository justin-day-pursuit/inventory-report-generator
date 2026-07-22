"use client";

import { useState } from "react";
import { sampleCsv } from "@/lib/sample-data";
import type { StockReport, StockStatus } from "@/lib/inventory";

const statusStyles: Record<StockStatus, { label: string; className: string }> = {
  out_of_stock: { label: "Out of stock", className: "bg-red-500/20 text-red-300 border border-red-500/40" },
  low_stock: { label: "Low stock", className: "bg-amber-500/20 text-amber-300 border border-amber-500/40" },
  in_stock: { label: "In stock", className: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40" },
};

export default function Home() {
  const [csv, setCsv] = useState<string>(sampleCsv);
  const [report, setReport] = useState<StockReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error ?? "Failed to generate report.");
      }
      setReport(data as StockReport);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "Unexpected error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Inventory Report Generator</h1>
        <p className="mt-2 text-slate-400">
          Paste inventory data as CSV and generate a stock level report.
        </p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl backdrop-blur">
        <label htmlFor="csv" className="mb-2 block text-sm font-medium text-slate-300">
          Inventory data (CSV: sku,name,quantity,reorderThreshold,unitPrice)
        </label>
        <textarea
          id="csv"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={9}
          spellCheck={false}
          className="w-full rounded-xl border border-white/10 bg-slate-900/70 p-4 font-mono text-sm text-slate-100 outline-none focus:border-indigo-400/60"
        />
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="rounded-xl bg-indigo-500 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Generating…" : "Generate report"}
          </button>
          <button
            onClick={() => setCsv(sampleCsv)}
            className="rounded-xl border border-white/15 px-4 py-2.5 text-sm text-slate-300 transition hover:bg-white/5"
          >
            Reset sample data
          </button>
        </div>
        {error && (
          <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </section>

      {report && (
        <section className="mt-8" data-testid="report">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            <SummaryCard label="Items" value={report.totals.itemCount.toString()} />
            <SummaryCard label="Total units" value={report.totals.totalUnits.toLocaleString()} />
            <SummaryCard label="Stock value" value={`$${report.totals.totalStockValue.toLocaleString()}`} />
            <SummaryCard label="Low stock" value={report.totals.lowStockCount.toString()} accent="amber" />
            <SummaryCard label="Out of stock" value={report.totals.outOfStockCount.toString()} accent="red" />
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-white/5 text-left text-slate-300">
                <tr>
                  <th className="px-4 py-3 font-medium">SKU</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 text-right font-medium">Qty</th>
                  <th className="px-4 py-3 text-right font-medium">Reorder at</th>
                  <th className="px-4 py-3 text-right font-medium">Unit price</th>
                  <th className="px-4 py-3 text-right font-medium">Stock value</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {report.lines.map((line) => (
                  <tr key={line.sku} className="border-t border-white/5">
                    <td className="px-4 py-3 font-mono text-slate-300">{line.sku}</td>
                    <td className="px-4 py-3">{line.name}</td>
                    <td className="px-4 py-3 text-right">{line.quantity}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{line.reorderThreshold}</td>
                    <td className="px-4 py-3 text-right">${line.unitPrice.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">${line.stockValue.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[line.status].className}`}>
                        {statusStyles[line.status].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Report generated at {new Date(report.generatedAt).toLocaleString()}
          </p>
        </section>
      )}
    </main>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber" | "red";
}) {
  const accentClass =
    accent === "amber"
      ? "text-amber-300"
      : accent === "red"
        ? "text-red-300"
        : "text-slate-100";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accentClass}`}>{value}</p>
    </div>
  );
}
