/**
 * ============================================================================
 * CHECK INCOMING SUPPLIES PAGE (app/check/incoming/page.tsx)
 * ============================================================================
 * WHAT THIS PAGE IS FOR:
 * Opens in a NEW browser tab when you click "Check incoming supplies".
 * Loads data/incoming/incoming.json via /api/incoming so receiving totals can be
 * verified before they are added into inventory.
 *
 * HOW TO MAINTAIN:
 * - Keep columns in sync with fields used in data/incoming/incoming.json:
 *   sku, name, quantity, expiration, storageRequirements.
 * - New SKUs in this feed become new inventory rows when you run Update.
 * ============================================================================
 */

"use client";

import { useEffect, useState } from "react";
import type { IncomingItem } from "@/lib/inventory";

export default function CheckIncomingPage() {
  const [items, setItems] = useState<IncomingItem[]>([]);
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
        <h1 className="font-display mt-1 text-3xl font-semibold tracking-tight">
          Incoming supplies
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Read-only view of <code className="font-mono text-sm">data/incoming/incoming.json</code>
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
          <p className="text-sm text-[var(--muted)]">{items.length} supply row(s)</p>
        </div>
        <div className="inventory-scroll">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-[#10201b] text-left text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 text-right font-medium">Quantity</th>
                <th className="px-4 py-3 font-medium">Expiration</th>
                <th className="px-4 py-3 font-medium">Storage requirements</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-[var(--muted)]">
                    No incoming rows found. Add data to data/incoming/incoming.json.
                  </td>
                </tr>
              ) : (
                items.map((row, idx) => (
                  <tr key={`${row.sku}-${idx}`} className="border-t border-white/5">
                    <td className="font-mono px-4 py-3 text-[var(--muted)]">{row.sku}</td>
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3 text-right">{row.quantity}</td>
                    <td className="px-4 py-3">{row.expiration}</td>
                    <td className="px-4 py-3 text-[var(--muted)]">{row.storageRequirements}</td>
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
