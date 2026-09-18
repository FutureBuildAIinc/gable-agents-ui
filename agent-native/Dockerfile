# Build the gable-quote agent-native app from the agent-native monorepo.
# Build context: agent-native/ (the monorepo root), NOT the template dir —
# the app depends on workspace packages (@agent-native/core, @gable/client).
#
#   docker build -f templates/gable-quote/Dockerfile -t gable-quote .
#
# Runtime env (all optional where noted):
#   PORT (default 3000)
#   APP_URL (public origin, e.g. https://quotes.experiments.futurebuild.ai)
#   BETTER_AUTH_SECRET (required)
#   DATABASE_URL (omit → PGlite on the /app/data volume)
#   GABLE_API_BASE_URL, GABLE_INTEGRATION_KEY (or GABLE_SERVICE_TOKEN)
#   APPWRITE_JWKS_URL, APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID
#   APPWRITE_EVENTS_READ_KEY (events consumer plugin, optional)
#   CLASSIC_UI_BASE_URL (classic ERP tile, optional)

FROM node:22-bookworm-slim AS build
WORKDIR /app

# Deterministic toolchain
RUN corepack enable && corepack prepare pnpm@10.29.1 --activate

# Copy manifests for the dependency-install layer
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY packages/core/package.json packages/core/
COPY packages/agentkit/package.json packages/agentkit/
COPY packages/toolkit/package.json packages/toolkit/
COPY packages/shared-app-config/package.json packages/shared-app-config/
COPY packages/gable-client/package.json packages/gable-client/
COPY templates/gable-quote/package.json templates/gable-quote/

RUN pnpm install --frozen-lockfile --ignore-scripts

# Full source
COPY . .

# The COPY . . above replaces the container's node_modules content with the
# repo's (empty) package node_modules dirs, severing workspace bin links.
# Re-link without touching the store.
RUN pnpm install --frozen-lockfile --ignore-scripts --prefer-offline

# Build workspace packages in dependency order (core's dist imports
# toolkit's design-system, so toolkit must build first; devDeps required for
# tsc/tsx so NODE_ENV stays unset here), then the production app bundle.
RUN pnpm --filter @agent-native/agentkit --filter @agent-native/shared-app-config \
      --filter @agent-native/toolkit --filter @agent-native/core run build
ENV NODE_ENV=production
RUN pnpm --filter gable-quote build

# Production stage: node output only
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/templates/gable-quote/.output .output

RUN mkdir -p /app/data && chown node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/_agent-native/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]

# NOTE: DATABASE_URL is REQUIRED in deployment — PGlite is a devDependency and
# not bundled in this production image. Point it at the platform Postgres
# (e.g. postgresql://gable_agents:...@<pg-host>:5432/gable_quote) per
# docs/runbook-live.md and platform/dual-frontend-deploy.md.
