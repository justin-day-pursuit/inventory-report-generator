# AGENTS.md

## Cursor Cloud specific instructions

This is a Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4 app. Standard commands live in `package.json` scripts and `README.md`; use those.

- Dev server: `npm run dev` → http://localhost:3000 (also http://127.0.0.1:3000). Production: `npm run build && npm start`. Docker: see `Dockerfile`. Requires Node.js 20.9+ (`.nvmrc` / `engines`).
- Lint: `npm run lint` (`eslint .` with flat `eslint.config.mjs`). CI: `npm run ci`.
- Build: `npm run build` with `output: "standalone"` in `next.config.mjs`. Security response headers are configured there.
- Health: `GET /api/health`.
- Core logic: `lib/inventory.ts` (status/alerts/report), `lib/data-store.ts` (CSV I/O + column map), `lib/csv.ts` (CSV parse/serialize), `lib/validate.ts` (API validation).
- Data files:
  - `data/inventory/inventory.csv` — live dairy dataset, one line per product batch (writable by update)
  - Display is grouped into unique products (`PRODUCT_KEY` in `lib/data-store.ts`): one row per product id + brand, e.g. `1-Amul`, showing that product's newest record. `csvProductId` keeps the raw `Product ID` for writes.
  - `data/inventory/inventory.seed.csv` — untouched original dataset; `npm run restore:inventory`
  - Columns used by the app: `Product ID`, `Product Name`, `Brand`, `Quantity (liters/kg)`, `Quantity Sold (liters/kg)`, `Quantity in Stock (liters/kg)`, `Storage Condition`, `Expiration Date`, `Date`, `Shelf Life (days)`, `Minimum Stock Threshold (liters/kg)`, `Reorder Quantity (liters/kg)`
  - `/api/sales` and `/api/incoming` are read-only views derived from that CSV (no separate feed files)
- Persist `data/` on deploy hosts; file writes will not stick on ephemeral serverless FS without external storage.
