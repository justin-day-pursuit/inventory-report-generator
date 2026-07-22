/**
 * ============================================================================
 * NEXT.JS CONFIG (next.config.mjs)
 * ============================================================================
 * WHAT THIS FILE IS FOR:
 * Project-wide Next.js settings used by `npm run dev`, `npm run build`, and
 * `npm start`. Keep this file small — most Stockflow behavior lives in app/ and lib/.
 *
 * LOCAL MACHINE NOTES:
 * - Dev/start scripts listen on all local interfaces at port 3000 (see package.json),
 *   so both http://localhost:3000 and http://127.0.0.1:3000 work.
 * - `allowedDevOrigins` keeps the Next 16 dev overlay happy for those URLs.
 * ============================================================================
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Helps local browsers talking to the Next 16 dev server without noisy origin warnings.
  allowedDevOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],

  // Fail the production build if TypeScript errors appear — safer for local/CI checks.
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
