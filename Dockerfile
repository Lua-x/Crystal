# syntax=docker/dockerfile:1

# ── Build ─────────────────────────────────────────────────────────────────────
# Same Debian release (glibc) as the runtime image, so native modules match.
FROM node:24-trixie-slim AS build

ENV CI=true
WORKDIR /repo

# Install the pnpm version pinned in package.json ("packageManager").
COPY package.json ./
RUN npm install --global --no-fund --no-audit \
    "pnpm@$(node -p "require('./package.json').packageManager.split('@')[1]")"

# Dependencies first, so source changes do not invalidate this layer.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# A standalone server with production dependencies only, plus the web app.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @crystal/server deploy --prod /out \
    && node scripts/prune-deploy.mjs /out \
    && rm -f /out/pnpm-lock.yaml /out/pnpm-workspace.yaml \
    && cp -r apps/web/dist /out/public \
    && mkdir -p /data

# ── Runtime ───────────────────────────────────────────────────────────────────
# Distroless: no shell, no package manager; runs as the unprivileged user 65532.
FROM gcr.io/distroless/nodejs24-debian13:nonroot

ARG VERSION=dev
LABEL org.opencontainers.image.title="Crystal" \
      org.opencontainers.image.description="A calm, self-hosted to-do app" \
      org.opencontainers.image.source="https://github.com/Lua-x/crystal" \
      org.opencontainers.image.licenses="AGPL-3.0-only" \
      org.opencontainers.image.version="${VERSION}"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data

WORKDIR /app
COPY --from=build --chown=65532:65532 /out /app
# An empty, writable data directory. Named volumes inherit its ownership.
COPY --from=build --chown=65532:65532 /data /data

VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["/nodejs/bin/node", "/app/dist/healthcheck.js"]

CMD ["/app/dist/index.js"]
