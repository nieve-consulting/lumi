# syntax=docker/dockerfile:1

# Lumi web app: public chat, /widget page, widget script, onboarding wizard and admin interface.
# Build from the repository root, as it uses the pnpm workspace and its shared packages:
#   docker build -f frontend/Dockerfile -t lumi-frontend .
# The image holds no business data or secrets: every setting but NEXT_PUBLIC_AGENTS_ENDPOINT is read when the container
# runs (see https://docs.lumi.nieve.ai/self-hosting), and the business's settings come from the API on request.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
# Compose passes its LUMI_IMAGE_PREFIX. A registry prefix means the images are pulled, so a build is a failed pull falling back
# to the checkout: stop it rather than tag a local build with the registry's name
ARG LUMI_IMAGE_PREFIX=lumi
RUN case "$LUMI_IMAGE_PREFIX" in */*) echo "LUMI_IMAGE_PREFIX is $LUMI_IMAGE_PREFIX, so Compose should pull these images, not build them. Check that docker compose pull succeeded for this LUMI_VERSION, or set LUMI_IMAGE_PREFIX=lumi to build from source." >&2; exit 1;; esac
WORKDIR /app
# Install the version declared by the root manifest, so release builds follow the same pin as contributors and CI
COPY package.json ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')" && npm cache clean --force

# The launcher is a separate npm package. Build it from this checkout rather than shipping the committed bundle, which
# may predate its source. Its dependencies stay out of the frontend's dependency tree and the runtime image. The bundle runs in
# browsers, so it is built natively even for another platform's image
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-bookworm-slim AS widget
WORKDIR /widget
COPY widget/package.json widget/package-lock.json ./
RUN --mount=type=cache,id=lumi-widget-npm-cache,target=/root/.npm npm ci
COPY widget ./
RUN npm run build:umd

# Dependencies, from the manifests only, so they're reinstalled only when these change
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json frontend/
COPY packages/shared-contracts/package.json packages/shared-contracts/
# The other workspace packages aren't installed, but their manifests keep the lockfile check complete
COPY backend/package.json backend/
RUN --mount=type=cache,id=lumi-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter "lumi-frontend..."

FROM deps AS build
COPY packages/shared-contracts packages/shared-contracts
COPY frontend frontend
# Include the dependency license notices emitted alongside the bundle
COPY --from=widget /widget/dist/ frontend/public/scripts/
# Where browsers call the agents API, inlined into the browser code at build time. The default is a path on the web app's own
# origin, for a reverse proxy that routes /agents to the agents service; set an absolute URL when browsers reach it elsewhere
ARG NEXT_PUBLIC_AGENTS_ENDPOINT=/agents
ENV NEXT_PUBLIC_AGENTS_ENDPOINT=${NEXT_PUBLIC_AGENTS_ENDPOINT} \
    NEXT_OUTPUT=standalone
# No API, database or secret is needed: pages with the business's settings are rendered when first requested
RUN pnpm -C frontend build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
# The commit the chat reports with its version, when the build passes one
ARG COMMIT_ID=""
LABEL org.opencontainers.image.title="Lumi web app" \
      org.opencontainers.image.source="https://github.com/nieve-consulting/lumi" \
      org.opencontainers.image.licenses="AGPL-3.0-only AND Apache-2.0"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    COMMIT_ID=${COMMIT_ID}
WORKDIR /app
# The standalone server traced from the repository root (frontend/server.js with the node_modules it needs), plus the static
# files it serves itself. Owned by the unprivileged node user, which writes the pages and data it caches under frontend/.next
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public
USER node
EXPOSE 3000
CMD ["node", "frontend/server.js"]
