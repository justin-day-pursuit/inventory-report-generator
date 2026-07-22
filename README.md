# inventory-report-generator (Stockflow)

Inventory monitoring tool for coordinators: view current stock, load sales and incoming supply feeds, update on-hand quantities, and generate a curated restock report.

## Tech stack

- Next.js 16 (App Router, Turbopack) + React 19
- TypeScript
- Tailwind CSS v4 + custom CSS in `app/globals.css`
- ESLint (flat config via `eslint-config-next`)

## Prerequisites (local machine)

- **Node.js 20.9+** (20 LTS or newer; see `.nvmrc`)
- **npm 10+** (comes with current Node installers)

Check versions:

```bash
node -v
npm -v
```

If you use `nvm`:

```bash
nvm install
nvm use
```

## Getting started (working local URL)

From the project root (the folder that contains `package.json`):

```bash
npm install
npm run dev
```

Then open:

**http://localhost:3000**

That is the Stockflow monitoring UI. Leave the terminal open while you use the app.

### Production-style local run

```bash
npm run build
npm start
```

Same URL: **http://localhost:3000**

### If port 3000 is already in use

```bash
npx next dev --hostname localhost --port 3001
```

Then open http://localhost:3001.

## How to use the page

1. **Alert cards** at the top summarize out-of-stock, understocked, overstocked, expiring, and expired items.
2. **Current inventory** lists SKU, Name, Quantity, Expiration, Rate of Sale, and Storage Requirements. Search and filters stay fixed while the table scrolls; use Previous/Next for pages.
3. **Department data sync**
   - **Load sales data** / **Load incoming supplies** — API calls that read the JSON mock feeds.
   - **Check sales data** / **Check incoming supplies** — open a new tab with a list view of that feed.
   - **Update current inventory** — adds incoming quantities and subtracts sales, then saves inventory.
4. **Generate report** — builds a curated status report with recommendations.

## Mock data folders (API sources)

| Folder | File | Used by |
| --- | --- | --- |
| `data/inventory/` | `inventory.json` | `GET /api/inventory`, update + report |
| `data/sales/` | `sales.json` | `GET /api/sales` |
| `data/incoming/` | `incoming.json` | `GET /api/incoming` |

Edit these JSON arrays to change demo data. An empty array `[]` is valid and shows an empty list. When real department APIs exist, replace the readers in `lib/data-store.ts` while keeping the same shapes.

## Scripts

- `npm run dev` — development server at http://localhost:3000
- `npm run build` — production build (also type-checks)
- `npm start` — run the production build at http://localhost:3000
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript only (`tsc --noEmit`)

## Project layout

- `app/page.tsx` — main monitoring UI
- `app/check/sales/page.tsx` — sales check tab
- `app/check/incoming/page.tsx` — incoming supplies check tab
- `app/api/inventory/` — load inventory
- `app/api/inventory/update/` — apply sales + supplies
- `app/api/sales/` — load sales JSON
- `app/api/incoming/` — load incoming JSON
- `app/api/report/` — curated report
- `lib/inventory.ts` — alerts, updates, report logic
- `lib/data-store.ts` — read/write JSON under `data/`
- `data/**` — mock JSON feeds
