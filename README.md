# inventory-report-generator

MVP to generate a stock level report based on inventory data.

A small [Next.js](https://nextjs.org) (App Router) web app: paste inventory data as CSV and generate a stock level report showing per-item status (in stock / low stock / out of stock), total units, and total stock value.

## Tech stack

- Next.js 16 (App Router, Turbopack) + React 19
- TypeScript
- Tailwind CSS v4
- ESLint (flat config via `eslint-config-next`)

## Getting started

Install dependencies and start the dev server:

```bash
npm install
npm run dev
```

Open http://localhost:3000, edit the CSV (or keep the sample), and click **Generate report**.

## Scripts

- `npm run dev` — start the development server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — run the production build
- `npm run lint` — run ESLint

## Project layout

- `app/page.tsx` — UI for entering inventory data and viewing the report
- `app/api/report/route.ts` — API endpoint that computes the report
- `lib/inventory.ts` — core report logic and CSV parsing
- `lib/sample-data.ts` — sample inventory data
