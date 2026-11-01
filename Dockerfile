# syntax=docker/dockerfile:1

# Debian/glibc is required for the Chromium dependencies installed by Playwright.
FROM node:26-bookworm-slim AS build

WORKDIR /app
RUN npm install --global pnpm@11.8.0

COPY package.json pnpm-lock.yaml tsconfig.json ./
RUN pnpm install --frozen-lockfile

COPY src ./src
COPY tests ./tests
RUN pnpm build

FROM node:26-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PROOFPATH_RUNTIME=hosted \
    PORT=3000 \
    FIXTURE_PORT=4173 \
    DATA_DIR=/var/data/proofpath \
    V2_OPERATOR_DIR=/var/data/proofpath/operator \
    PLANNER_MODE=fixture

WORKDIR /app
RUN npm install --global pnpm@11.8.0

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile \
    && pnpm exec playwright install --with-deps chromium \
    && pnpm store prune

COPY --from=build /app/dist/src ./dist/src
COPY public ./public
COPY scripts/container-healthcheck.mjs ./scripts/container-healthcheck.mjs

# The persistent volume at /var/data/proofpath must be provisioned writable by
# UID 1000 by the managed host. Do not chown it at startup: it may contain real
# operator state and container execution remains non-root.
RUN chown --recursive node:node /app /ms-playwright

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "scripts/container-healthcheck.mjs"]

CMD ["node", "dist/src/server.js"]
