# ============================================================================
# Dockerfile — Iqra Academy (Next.js 16)
# ============================================================================
# Multi-stage build for production. Final image is ~150MB (vs ~1.5GB without).
#
# 📚 HOW MULTI-STAGE BUILDS WORK:
# Stage 1 (deps):    Install npm packages
# Stage 2 (builder): Copy source + build Next.js (creates .next/standalone)
# Stage 3 (runner):  Copy only the built output — no source code, no devDeps
#
# This means your production container has:
# ✅ node_modules (production only)
# ✅ .next/standalone (compiled server)
# ✅ .next/static (CSS, JS chunks)
# ✅ public/ (images, fonts)
# ❌ Source code, devDependencies, docs, Flutter app
# ============================================================================

FROM node:20-alpine AS base

# ── Stage 1: Install Dependencies ────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

# Install curl for healthcheck in the final stage
RUN apk add --no-cache curl

# Copy package files first (Docker caches this layer if they haven't changed)
COPY package.json package-lock.json* ./
RUN npm ci --production=false

# ── Stage 2: Build ──────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js (output: standalone mode creates a self-contained server)
# This needs all env vars that are used at build time (NEXT_PUBLIC_*)
ARG NEXT_PUBLIC_APP_URL=https://quran.learnnovice.com
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
ARG BETTER_AUTH_SECRET="dummy-secret-for-build-time-only-replaced-at-runtime"
ARG STRIPE_SECRET_KEY="sk_dummy_for_build_only"
ARG RESEND_API_KEY="re_dummy_for_build_only"
ARG GOOGLE_CLIENT_ID="dummy_google_id"
ARG GOOGLE_CLIENT_SECRET="dummy_google_secret"

ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=${NEXT_PUBLIC_VAPID_PUBLIC_KEY}
ENV BETTER_AUTH_SECRET=${BETTER_AUTH_SECRET}
ENV STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
ENV RESEND_API_KEY=${RESEND_API_KEY}
ENV GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID}
ENV GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET}

RUN npm run build

# ── Stage 3: Production Runner ──────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install curl for healthcheck
RUN apk add --no-cache curl

# Create non-root user (security: don't run as root)
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Set ownership to non-root user
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Healthcheck — Dockploy uses this to know if the container is healthy
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
