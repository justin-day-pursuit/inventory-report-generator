/**
 * ============================================================================
 * CHECK SALES DATA PAGE (app/check/sales/page.tsx)
 * ============================================================================
 * Read-only list of inventory batches from /api/sales.
 * Shows each batch's summed Quantity Sold (liters/kg) from the inventory CSV.
 * The "Check sales data" button on the main page is switched off.
 * ============================================================================
 */

"use client";

import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { SalesItem } from "@/lib/inventory";

export default function CheckSalesPage() {
  const [items, setItems] = useState<SalesItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/sales");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Could not load sales.");
        if (!cancelled) {
          setItems(data.items ?? []);
          setTotal(data.total ?? data.items?.length ?? 0);
          setLoadedAt(data.loadedAt ?? new Date().toISOString());
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unexpected error.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Stockflow check</p>
          <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight">Sales data</h1>
          <p className="mt-2 text-[var(--muted)]">
            Read-only view of <code className="font-mono text-sm">data/inventory/inventory.csv</code>
            {loadedAt ? ` · loaded ${new Date(loadedAt).toLocaleString()}` : ""}
          </p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Amounts are the summed Quantity Sold (liters/kg) for each batch.
            Sold-cover restock status on the main page is switched off for now.
          </p>
        </div>
        <ThemeToggle />
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="inventory-shell" style={{ maxHeight: "75vh" }}>
        <div className="inventory-toolbar">
          <p className="text-sm text-[var(--muted)]">
            {items.length.toLocaleString()} of {total.toLocaleString()} batch(es)
          </p>
        </div>
        <div className="inventory-scroll">
          <table className="w-full border-collapse text-sm">
            <thead className="table-head sticky top-0 text-left text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 text-right font-medium">Quantity Sold (liters/kg)</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-8 text-center text-[var(--muted)]">
                    No batches found in data/inventory/inventory.csv.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.name} className="row-divider">
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.quantitySold.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
