# Stockflow (inventory-report-generator)

Inventory monitoring for coordinators: browse a real dairy inventory dataset batch by batch, see the stock status of every batch (sold out, understocked, overstocked, expiring soon, expired), and generate a curated restock report.

Data source: `data/inventory/inventory.csv` — one line per product batch, with brand, quantity, quantity sold, storage condition, expiration date, and restock thresholds.

## Tech stack

- Next.js 16 (App Router, Turbopack) + React 19
- TypeScript
- Tailwind CSS v4 + custom CSS in `app/globals.css`
- CSV dataset under `data/inventory/` (real dairy inventory export)

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

After Update demos change live stock:

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

`npm start` boots the standalone Node server (see `scripts/start-production.cjs`). Serve behind a reverse proxy (nginx/Caddy) with HTTPS. Keep the `data/` directory on persistent disk so inventory writes survive restarts.

### Option B — Docker (recommended for VMs)

```bash
npm run docker:build
npm run docker:run
```

Or:

```bash
docker build -t stockflow .
docker run --rm -p 3000:3000 -v stockflow-data:/app/data stockflow
```

- App: http://localhost:3000
- Health: http://localhost:3000/api/health
- Persist `/app/data` with a volume — inventory updates write to `inventory.csv`

### Important deployment notes

1. **Persistence:** `POST /api/inventory/update` writes `data/inventory/inventory.csv`. Use a durable volume (Docker/VM). Pure ephemeral serverless filesystems will lose writes.
2. **Auth:** Routes are currently open. Put the service on a private network or add authentication before exposing to the public internet.
3. **Seed vs live data:** `inventory.seed.csv` is the untouched original dataset; `inventory.csv` is the live working copy.
4. **Config:** Copy `.env.example` → `.env.local` for local overrides (do not commit secrets).

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

1. **Alert cards** summarize out-of-stock, understocked, overstocked, expiring, and expired items.
2. **Current inventory** lists Product ID, Name (Brand + Product Name), Quantity (liters/kg), Quantity Sold (liters/kg), Storage Conditions, Expiration Date, and Status. 50 rows show per page by default; the **Show** dropdown goes up to 500. Search/filter stay fixed; the table scrolls; pagination sits below.
3. **Department data sync** — currently paused: the Load / Check / Update buttons are visible but their click handlers are commented out (see `app/page.tsx`).
4. **Theme toggle** — Defaults to light mode; switch to dark anytime (saved in the browser).
5. **Generate report** — Curated status report with recommendations.

## Data layout

| Path | Role |
| --- | --- |
| `data/inventory/inventory.csv` | Live stock — one line per dairy product batch (writable) |
| `data/inventory/inventory.seed.csv` | Untouched original dataset, used by `npm run restore:inventory` |

## Project layout

- `app/page.tsx` — main monitoring UI
- `app/check/*` — sales / incoming check tabs
- `app/api/*` — inventory, sales, incoming, update, report, health
- `lib/inventory.ts` — alerts, updates, report logic
- `lib/csv.ts` — CSV reader / writer
- `lib/data-store.ts` — CSV file I/O and the CSV-column → app-field map
- `lib/validate.ts` — API body validation
- `components/*` — theme provider / toggle
- `Dockerfile` — production container
