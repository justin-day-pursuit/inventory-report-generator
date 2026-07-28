/**
 * ============================================================================
 * CHECK SALES DATA PAGE (app/check/sales/page.tsx)
 * ============================================================================
 * WHAT THIS PAGE IS FOR:
 * A read-only list of how much of each product batch has already sold. It reads
 * /api/sales, which builds the list from the "Quantity Sold (liters/kg)" column of
 * data/inventory/inventory.csv.
 *
 * HOW TO REACH IT:
 * Open /check/sales directly. The "Check sales data" button on the main page is
 * currently switched off (see app/page.tsx), so it no longer opens this tab.
 *
 * HOW TO MAINTAIN:
 * - Column labels must stay aligned with the fields /api/sales returns:
 *   productId, name, quantitySold.
 * - The dataset holds thousands of rows, so the API returns the first 500 by
 *   default. Use /api/sales?limit=all to fetch every row.
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
            {items.length.toLocaleString()} of {total.toLocaleString()} sale row(s)
          </p>
        </div>
        <div className="inventory-scroll">
          <table className="w-full border-collapse text-sm">
            <thead className="table-head sticky top-0 text-left text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Product ID</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 text-right font-medium">Quantity Sold (liters/kg)</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-[var(--muted)]">
                    No sold quantities found in data/inventory/inventory.csv.
                  </td>
                </tr>
              ) : (
                items.map((row, idx) => (
                  <tr key={`${row.productId}-${idx}`} className="row-divider">
                    <td className="font-mono px-4 py-3 text-[var(--muted)]">{row.productId}</td>
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
