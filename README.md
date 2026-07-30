# Stockflow (inventory-report-generator)

Morning workbench for a dairy inventory coordinator: see which batches need action today (low stock, sold out, expired, or expiring within two weeks), place reorders, and generate a weekly-style status report — without reading every spreadsheet row.

Data source: `data/inventory/inventory.csv` — real dairy export (~4,325 lines).

## How batches are built

CSV lines that share **Location + Product Name + Brand + Storage Condition + Sales Channel** are rolled into one batch (~1,940 batches).

| Field | Rule |
| --- | --- |
| Quantity, Minimum Stock Threshold, Reorder Quantity, Total Value, Approx. Total Revenue | Sum of the source lines |
| Price per Unit | Quantity-weighted average |
| Expiration | Earliest of each line's `min(Expiration Date, Production Date + Shelf Life days)` |
| Customer locations | Running list of distinct `Customer Location` values |
| Name | Brand + Product Name |

**Ignored for status math (for now):** `Quantity Sold` and `Quantity in Stock`. Stock status uses summed **Quantity** vs summed **Minimum Stock Threshold** / **Reorder Quantity**.

**Status clock:** shelf life is measured against `APP_REFERENCE_DATE` in `lib/inventory.ts` (default `2018-11-20`, near the earliest expiration in the file), not the real calendar, so this historical export still shows a useful mix of expired / expiring / ok. Switch `STATUS_CLOCK` to `"real_today"` for a live feed.

## Tech stack

- Next.js 16 (App Router, Turbopack) + React 19
- TypeScript
- Tailwind CSS v4 + custom CSS in `app/globals.css`
- CSV dataset under `data/inventory/`

## Prerequisites

- **Node.js 20.9+** (see `.nvmrc`)
- **npm 10+**

```bash
node -v
npm -v
```

## Local development

```bash
npm install
npm run dev
```

Open **http://localhost:3000**

```bash
npm run build
npm start
```

Health check: **http://localhost:3000/api/health**

### Reset inventory baseline

```bash
npm run restore:inventory
```

## Production deployment

### Option A — Node host (`npm start`)

```bash
npm ci
npm run build
npm start
```

Keep `data/` on persistent disk so inventory writes survive restarts.

### Option B — Docker

```bash
npm run docker:build
npm run docker:run
```

- App: http://localhost:3000
- Health: http://localhost:3000/api/health
- Persist `/app/data` with a volume

### Important deployment notes

1. **Persistence:** `POST /api/inventory/update` writes `data/inventory/inventory.csv`. Use a durable volume.
2. **Auth:** Routes are currently open — put the service on a private network or add auth before public exposure.
3. **Seed vs live data:** `inventory.seed.csv` is the untouched original; `inventory.csv` is the live copy.
4. **Config:** Copy `.env.example` → `.env.local` for local overrides.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Development server at http://localhost:3000 |
| `npm run build` | Production build (`output: "standalone"`) |
| `npm start` | Run production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript check |
| `npm run ci` | lint + typecheck + build |
| `npm run restore:inventory` | Reset live inventory from seed |
| `npm run docker:build` / `docker:run` | Container image helpers |

## How to use the page

1. **Load inventory data** — drop a dairy CSV from your device, or press **Load inventory from codebase**. Nothing is shown yet.
2. **Display inventory** — appears after a file is staged; transforms the CSV into batches and populates alert badges + the list. The page scrolls so the **alert badges** sit at the top.
3. **Refresh** — clears staged and displayed data (same as a full page reload). Load again to continue.
4. **Alert cards** (after Display) summarize need-action (morning aggregate), sold out, understocked, expiring soon, and expired batches. Each number is a batch count. Click a card to apply that filter to the inventory list. (Overstocked has no summary badge; use the Show filter or Stock Status column.)
5. **Inventory batches** (default filter **Needs action**) lists batches that are expired, expiring within 14 days, sold out, or understocked. Columns: Name, Location, Sales Channel, Storage Conditions, Quantity, Expiration, Expiration Status, Stock Status. Switch the filter to Overstocked / Healthy / All batches as needed. 50 rows per page by default (Rows dropdown goes to 500).
6. **Department data sync** — commented out in `app/page.tsx` (search `DEPARTMENT DATA SYNC (SWITCHED OFF)` to restore). Report success/error messages show in the curated report section.
7. **Generate report** — curated status report from the batches on screen; the page scrolls so the **report section** sits at the top. Status banners appear in this section.
8. **Theme toggle** — defaults to the device / OS theme (system light → light, system dark → dark). After you toggle, that choice is remembered in the browser.

## Data layout

| Path | Role |
| --- | --- |
| `data/inventory/inventory.csv` | Live dairy export; grouped into batches for display (writable) |
| `data/inventory/inventory.seed.csv` | Untouched original; `npm run restore:inventory` |

## Project layout

- `app/page.tsx` — main coordinator UI
- `app/check/*` — sales / incoming check tabs
- `app/api/*` — inventory, sales, incoming, update, report, health
- `lib/inventory.ts` — status rules, filters, alerts, report
- `lib/csv.ts` — CSV reader / writer
- `lib/data-store.ts` — CSV I/O and batch aggregation
- `lib/validate.ts` — API body validation
- `components/*` — theme provider / toggle
- `Dockerfile` — production container
