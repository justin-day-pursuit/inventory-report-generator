# AGENTS.md

## Cursor Cloud specific instructions

This is a Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4 app. Standard commands live in `package.json` scripts and `README.md`; use those.

- Dev server: `npm run dev` listens on `0.0.0.0:3000` and is opened as http://localhost:3000 (http://127.0.0.1:3000 also works). Production local serve: `npm run build && npm start` (same URL). Requires Node.js 20.9+ (see `.nvmrc` / `package.json` `engines`).
- Lint: `npm run lint` runs `eslint .`. Note `next lint` was removed in Next 16, so the script uses ESLint directly with the flat config in `eslint.config.mjs` (which imports `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` as flat arrays — do not wrap them in `FlatCompat`, that throws a circular-JSON error).
- Build: `npm run build`. On the first build, Next rewrites `tsconfig.json` (sets `jsx` to `react-jsx` and adds `.next/dev/types/**/*.ts` to `include`); this is expected and already committed. TypeScript build errors are not ignored (`next.config.mjs`).
- Core logic is framework-free in `lib/inventory.ts` (alerts, inventory updates from sales/supplies, report generation) and `lib/data-store.ts` (JSON file I/O). API routes under `app/api/*` and the UI in `app/page.tsx` call into them.
- Mock JSON feeds (referenced by API routes):
  - `data/inventory/inventory.json` — current stock (`sku`, `name`, `quantity`, `expiration`, `rateOfSale`, `storageRequirements`, `reorderThreshold`, `overstockThreshold`)
  - `data/sales/sales.json` — sold products (`sku`, `name`, `quantity`, `rateOfSale`)
  - `data/incoming/incoming.json` — incoming supplies (`sku`, `name`, `quantity`, `expiration`, `storageRequirements`)
