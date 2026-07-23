/**
 * ============================================================================
 * NEXT.JS CONFIG (next.config.mjs)
 * ============================================================================
 * Production-oriented Next.js settings for Stockflow.
 * - `output: "standalone"` enables a slim Node server image (see Dockerfile)
 * - Security headers apply in production responses
 * ============================================================================
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Slim deploy artifact for Docker / VM hosts (not needed for Vercel).
  output: "standalone",

  // Helps local browsers talking to the Next 16 dev server without noisy origin warnings.
  allowedDevOrigins: ["http://localhost:3000", "http://127.0.0.1:3000"],

  typescript: {
    ignoreBuildErrors: false,
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
