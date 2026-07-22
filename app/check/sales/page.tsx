/**
 * ============================================================================
 * CHECK SALES DATA PAGE (app/check/sales/page.tsx)
 * ============================================================================
 * WHAT THIS PAGE IS FOR:
 * Opens in a NEW browser tab when you click "Check sales data" on the main tool.
 * It loads data/sales/sales.json through the /api/sales API and shows every row
 * in a simple list — so coordinators can verify the feed before updating stock.
 *
 * HOW TO MAINTAIN:
 * - Column labels must stay aligned with sales.json fields:
 *   sku, name, quantity, rateOfSale.
 * - Do not delete the fetch to /api/sales — that is the live link to the mock file.
 * ============================================================================
 */

"use client";

import { useEffect, useState } from "react";
import type { SalesItem } from "@/lib/inventory";

export default function CheckSalesPage() {
  const [items, setItems] = useState<SalesItem[]>([]);
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
      <header className="mb-6">
        <p className="text-sm uppercase tracking-[0.18em] text-[var(--muted)]">Stockflow check</p>
        <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight">Sales data</h1>
        <p className="mt-2 text-[var(--muted)]">
          Read-only view of <code className="font-mono text-sm">data/sales/sales.json</code>
          {loadedAt ? ` · loaded ${new Date(loadedAt).toLocaleString()}` : ""}
        </p>
      </header>

      {error && (
        <p className="mb-4 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-2 text-sm">
          {error}
        </p>
      )}

      <div className="inventory-shell" style={{ maxHeight: "75vh" }}>
        <div className="inventory-toolbar">
          <p className="text-sm text-[var(--muted)]">{items.length} sale row(s)</p>
        </div>
        <div className="inventory-scroll">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-[#10201b] text-left text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 text-right font-medium">Quantity</th>
                <th className="px-4 py-3 text-right font-medium">Rate of sale</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[var(--muted)]">
                    No sales rows found. Add data to data/sales/sales.json.
                  </td>
                </tr>
              ) : (
                items.map((row, idx) => (
                  <tr key={`${row.sku}-${idx}`} className="border-t border-white/5">
                    <td className="font-mono px-4 py-3 text-[var(--muted)]">{row.sku}</td>
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3 text-right">{row.quantity}</td>
                    <td className="px-4 py-3 text-right">
                      {row.rateOfSale}
                      <span className="text-[var(--muted)]"> /day</span>
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
