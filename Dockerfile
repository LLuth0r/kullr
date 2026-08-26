# syntax=docker/dockerfile:1.7
# ──────────────────────────────────────────────────────────────────
# Kullr — single image serving Angular + Express
# ──────────────────────────────────────────────────────────────────

# ── Stage 1: build the Angular frontend ──
FROM node:20-alpine AS web-build
WORKDIR /web
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY angular.json tsconfig.json tsconfig.app.json ./
COPY src ./src
COPY public ./public
RUN npx ng build --configuration production


# ── Stage 2: build the Express backend ──
FROM node:20-alpine AS server-build
WORKDIR /server
COPY server/package.json server/package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY server/tsconfig.json ./
COPY server/src ./src
RUN npm run build && \
    npm prune --omit=dev


# ── Stage 3: runtime ──
FROM node:20-alpine AS runtime

# Run as the Unraid-default UID/GID (99:100 = nobody:users) by convention.
# Users can override via PUID/PGID at runtime.
ENV NODE_ENV=production \
    PORT=8080 \
    CONFIG_DIR=/config \
    STATIC_DIR=/app/public

WORKDIR /app

# Copy server (compiled JS + prod deps)
COPY --from=server-build /server/node_modules ./node_modules
COPY --from=server-build /server/dist ./dist
COPY --from=server-build /server/package.json ./package.json

# Copy frontend bundle
COPY --from=web-build /web/dist/kullr/browser ./public

# Config volume + non-root setup
RUN mkdir -p /config && chown -R 99:100 /app /config
USER 99:100

VOLUME ["/config"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --spider http://localhost:8080/api/health || exit 1

CMD ["node", "dist/index.js"]
