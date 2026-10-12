# syntax=docker/dockerfile:1.7
#
# One image, two services: the Next.js app (default command) and the realtime
# sidecar (`node realtime-server.mjs`). See deploy/docker-compose.yml.
#
# Build from the repo root:
#   docker build -t novicetutor .
#
# No secret is baked in. The only values compiled into the bundle are the
# NEXT_PUBLIC_* build args below, which are public by definition; everything
# else arrives at runtime from /opt/novicetutor/.env on the server.

FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1

# ── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /repo

# Every workspace manifest has to be present for `npm ci` to accept the
# lockfile, but only the web workspace is installed — the desktop app would
# otherwise pull Electron (hundreds of MB) into a server image.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/desktop/package.json apps/desktop/
COPY apps/mobile/package.json apps/mobile/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=web --include-workspace-root

# The root `postinstall` patches styled-jsx. It is idempotent, and running it
# explicitly means the build does not depend on whether a workspace-filtered
# install fires root lifecycle scripts.
RUN npm run postinstall

# ── Build ────────────────────────────────────────────────────────────────────
FROM deps AS build
WORKDIR /repo
COPY apps/web apps/web

# Compiled into the client bundle at build time. Changing one means a rebuild.
ARG NEXT_PUBLIC_APP_URL=https://novicetutor.com
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=
ARG NEXT_PUBLIC_REALTIME_URL=
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY=$NEXT_PUBLIC_VAPID_PUBLIC_KEY \
    NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL \
    NODE_ENV=production

WORKDIR /repo/apps/web

# `npm run build` rather than `next build` so the prebuild (MediaPipe assets)
# and postbuild (styled-jsx) hooks fire. The two inline values are
# placeholders that let modules which read them at import time load; they are
# scoped to this RUN, never reach the final image, and nothing connects to
# that address.
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
    BETTER_AUTH_SECRET="build-time-placeholder-not-a-real-secret-0000" \
    npm run build \
 && npm run build:realtime \
 && test -f .next/standalone/apps/web/server.js \
 && test -f dist/realtime-server.mjs

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

# HOSTNAME matters: Docker sets it to the container id, and the standalone
# server binds to whatever HOSTNAME says — so without this it listens on an
# address the healthcheck and Caddy cannot reach.
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    APP_DOWNLOADS_DIR=/data/downloads

COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
COPY --from=build --chown=node:node /repo/apps/web/dist/realtime-server.mjs ./realtime-server.mjs

RUN mkdir -p /app/apps/web/.next/cache /data/downloads \
 && chown -R node:node /app/apps/web/.next/cache /data/downloads

USER node
EXPOSE 3000 8787

# No HEALTHCHECK and no init here: compose owns both (`init: true`), because
# the two services need different checks.
CMD ["node", "apps/web/server.js"]
