# AGENTS.md

## Cursor Cloud specific instructions

This is a Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4 app. Standard commands live in `package.json` scripts and `README.md`; use those.

- Dev server: `npm run dev` → http://localhost:3000 (also http://127.0.0.1:3000). Production: `npm run build && npm start`. Docker: see `Dockerfile`. Requires Node.js 20.9+ (`.nvmrc` / `engines`).
- Lint: `npm run lint` (`eslint .` with flat `eslint.config.mjs`). CI: `npm run ci`.
- Build: `npm run build` with `output: "standalone"` in `next.config.mjs`. Security response headers are configured there.
- Health: `GET /api/health`.
- Core logic: `lib/inventory.ts` (alerts/updates/report), `lib/data-store.ts` (JSON I/O), `lib/validate.ts` (API validation).
- Data files:
  - `data/inventory/inventory.json` — live stock (writable by update)
  - `data/inventory/inventory.seed.json` — baseline; `npm run restore:inventory`
  - `data/sales/sales.json` — `sku`, `name`, `quantity`, `rateOfSale`
  - `data/incoming/incoming.json` — `sku`, `name`, `quantity`, `expiration`, `storageRequirements`
- Persist `data/` on deploy hosts; file writes will not stick on ephemeral serverless FS without external storage.
