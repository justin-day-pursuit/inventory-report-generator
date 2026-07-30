# ============================================================================
# Docker image for Stockflow (production)
# ============================================================================
# Build:  docker build -t stockflow .
# Run:    docker run --rm -p 3000:3000 \
#           -e GEMINI_API_KEY=your-key \
#           -e GEMINI_API_USERNAME=your-label \
#           -v stockflow-data:/app/data stockflow
# Open:   http://localhost:3000
#
# Mount /app/data so inventory updates survive container restarts.
# Pass Gemini secrets with -e / --env-file — never bake keys into the image.
# ============================================================================

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

# Standalone server + static assets
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Runtime CSV dataset (inventory.csv is writable; inventory.seed.csv is the baseline)
COPY --from=builder --chown=nextjs:nodejs /app/data ./data

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
