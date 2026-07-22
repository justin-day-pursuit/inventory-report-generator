# AGENTS.md

## Cursor Cloud specific instructions

This is a Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind v4 app. Standard commands live in `package.json` scripts and `README.md`; use those.

- Dev server: `npm run dev` serves at http://localhost:3000. There is a single service (no separate backend/database).
- Lint: `npm run lint` runs `eslint .`. Note `next lint` was removed in Next 16, so the script uses ESLint directly with the flat config in `eslint.config.mjs` (which imports `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` as flat arrays — do not wrap them in `FlatCompat`, that throws a circular-JSON error).
- Build: `npm run build`. On the first build, Next rewrites `tsconfig.json` (sets `jsx` to `react-jsx` and adds `.next/dev/types/**/*.ts` to `include`); this is expected and already committed.
- Core logic is framework-free in `lib/inventory.ts` (report generation + CSV parsing); the API route `app/api/report/route.ts` and UI `app/page.tsx` call into it. CSV columns are `sku,name,quantity,reorderThreshold,unitPrice`.
