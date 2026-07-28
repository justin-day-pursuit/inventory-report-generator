/**
 * ============================================================================
 * CHECK INCOMING SUPPLIES PAGE (app/check/incoming/page.tsx)
 * ============================================================================
 * WHAT THIS PAGE IS FOR:
 * A read-only list of received product batches — how much arrived, when it
 * expires, and how it must be stored. It reads /api/incoming, which builds the
 * list from data/inventory/inventory.csv.
 *
 * HOW TO REACH IT:
 * Open /check/incoming directly. The "Check incoming supplies" button on the main
 * page is currently switched off (see app/page.tsx).
 *
 * HOW TO MAINTAIN:
 * - Keep the columns in sync with the fields /api/incoming returns:
 *   name (brand + product), quantity, expirationDate, storageCondition.
 * - The API returns the first 500 rows by default; use ?limit=all for every row.
 * ============================================================================
 */

"use client";

import { useEffect, useState } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { IncomingItem } from "@/lib/inventory";

export default function CheckIncomingPage() {
  const [items, setItems] = useState<IncomingItem[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/incoming");
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error ?? "Could not load incoming supplies.");
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
          <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight">
            Incoming supplies
          </h1>
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
            {items.length.toLocaleString()} of {total.toLocaleString()} supply row(s)
          </p>
        </div>
        <div className="inventory-scroll">
          <table className="w-full border-collapse text-sm">
            <thead className="table-head sticky top-0 text-left text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 text-right font-medium">Quantity (liters/kg)</th>
                <th className="px-4 py-3 font-medium">Storage Conditions</th>
                <th className="px-4 py-3 font-medium">Expiration Date</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[var(--muted)]">
                    No batches found in data/inventory/inventory.csv.
                  </td>
                </tr>
              ) : (
                items.map((row) => (
                  <tr key={row.name} className="row-divider">
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.quantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">{row.storageCondition}</td>
                    <td className="px-4 py-3">{row.expirationDate}</td>
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
