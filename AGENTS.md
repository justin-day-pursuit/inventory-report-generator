# AGENTS.md

## Cursor Cloud specific instructions

This is a Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4 app. Standard commands live in `package.json` scripts and `README.md`; use those.

### Comments for non-technical maintainers

When you add or change code, update nearby comments so someone who is not very technical can still understand and maintain the project:

- Prefer plain English over jargon.
- For files / major sections: say what it is for, where the data comes from, and **how to maintain** it (what to edit, what not to touch).
- For UI blocks: briefly describe what the user sees and which labels or settings they might want to change.
- Match the existing comment style in `app/page.tsx`, `lib/inventory.ts`, and `lib/data-store.ts` (WHAT THIS IS FOR / HOW TO MAINTAIN banners).

- Dev server: `npm run dev` → http://localhost:3000 (also http://127.0.0.1:3000). Production: `npm run build && npm start`. Docker: see `Dockerfile`. Requires Node.js 20.9+ (`.nvmrc` / `engines`).
- Lint: `npm run lint` (`eslint .` with flat `eslint.config.mjs`). CI: `npm run ci`.
- Build: `npm run build` with `output: "standalone"` in `next.config.mjs`. Security response headers are configured there.
- Health: `GET /api/health`.
- Core logic: `lib/inventory.ts` (expiration/stock status, action filters, alerts, report), `lib/data-store.ts` (CSV I/O + batch aggregation), `lib/csv.ts` (CSV parse/serialize), `lib/validate.ts` (API validation).
- Data files:
  - `data/inventory/inventory.csv` — live dairy dataset (writable by update)
  - `data/inventory/inventory.seed.csv` — untouched original; `npm run restore:inventory`
  - Batches = unique `Location` + `Product Name` + `Brand` + `Storage Condition` + `Sales Channel`. Quantity / min threshold / reorder qty / money totals are summed; expiration is earliest of `min(Expiration Date, Production Date + Shelf Life)`; customer locations are a running list.
  - Status clock (UI label: "Today's Date"): `APP_REFERENCE_DATE` (`2018-11-20`) near earliest expiration for testing; `Quantity Sold` and `Quantity in Stock` ignored for status math.
  - Display columns: Name (Brand + Product Name), Location, Sales Channel, Storage Conditions, Quantity, Expiration, Expiration Status, Stock Status. Default filter: Needs action.
  - Full CSV columns available: Location, Total Land Area (acres), Number of Cows, Farm Size, Date, Product ID, Product Name, Brand, Quantity (liters/kg), Price per Unit, Total Value, Shelf Life (days), Storage Condition, Production Date, Expiration Date, Quantity Sold (liters/kg), Price per Unit (sold), Approx. Total Revenue(INR), Customer Location, Sales Channel, Quantity in Stock (liters/kg), Minimum Stock Threshold (liters/kg), Reorder Quantity (liters/kg).
  - `/api/sales` and `/api/incoming` are read-only views derived from that CSV (no separate feed files)
- Persist `data/` on deploy hosts; file writes will not stick on ephemeral serverless FS without external storage.
