# syntax=docker/dockerfile:1
#
# Lumi backend: one image for the api, agents, worker and mcp services and the one-off migrate, admin-reset, checkpoint-cleanup,
# status, export, import and delete-conversations commands. Built from the repository root, as the backend depends on the
# workspace's shared contracts:
#
#   docker build -f backend/Dockerfile --build-arg LUMI_VERSION=0.57.0 -t lumi-backend .
#   docker run --env-file lumi.env lumi-backend api
#
# The commands, their environment variables and GET /health are described in src/container/main.ts and config.ts. The AWS Lambda
# entry points (*/lambda/) are bundled separately and don't use this image.

ARG NODE_VERSION=24

# --- Dependencies and build ---------------------------------------------------------------------------------------------------
# Its output, the bundle, runs on any platform, so it is built natively even for another platform's image
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-trixie-slim AS build

# Compose passes its LUMI_IMAGE_PREFIX. A registry prefix means the images are pulled, so a build is a failed pull falling back
# to the checkout: stop it rather than tag a local build with the registry's name
ARG LUMI_IMAGE_PREFIX=lumi
RUN case "$LUMI_IMAGE_PREFIX" in */*) echo "LUMI_IMAGE_PREFIX is $LUMI_IMAGE_PREFIX, so Compose should pull these images, not build them. Check that docker compose pull succeeded for this LUMI_VERSION, or set LUMI_IMAGE_PREFIX=lumi to build from source." >&2; exit 1;; esac

ENV CI=true

WORKDIR /repo

# Install the version pinned by the repository, so local and image builds stay aligned
COPY package.json ./
RUN npm install --global "$(node -p 'require("./package.json").packageManager')"

# The manifests first, so the install layer is reused until a dependency changes. Every workspace package's manifest is there,
# so the frozen lockfile matches the workspace, but only the backend and its workspace dependencies are installed
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY packages/shared-contracts/package.json packages/shared-contracts/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "backend..."

COPY packages/shared-contracts packages/shared-contracts
COPY backend backend
RUN pnpm -C backend build:container

# --- Runtime ------------------------------------------------------------------------------------------------------------------
FROM node:${NODE_VERSION}-trixie-slim AS runtime

# Chromium's headless shell renders the PDF resumes (without the desktop browser's GTK and X11 dependencies), with fonts for
# Latin text and emoji. tini runs as PID 1: it forwards signals and reaps the processes Chromium leaves behind
RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium-headless-shell fonts-liberation fonts-dejavu-core fonts-noto-color-emoji tini ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-headless-shell \
    NODE_OPTIONS=--enable-source-maps

WORKDIR /app

# The bundle reads the migrations from ../../db/migrations (src/container/health.ts)
COPY --from=build --chown=root:root /repo/backend/dist/container/lumi.cjs /repo/backend/dist/container/lumi.cjs.map dist/container/
COPY --from=build --chown=root:root /repo/backend/db/migrations db/migrations

# The Lumi version the image is built from, which status reports and export records in its files. Last, so a new version reuses
# every layer above
ARG LUMI_VERSION=unknown
ENV LUMI_VERSION=${LUMI_VERSION}

# The node image's unprivileged user; the files above stay read-only to it
USER node

# api, agents, mcp and worker, unless PORT says otherwise
EXPOSE 4000 4200 4300 4500

ENTRYPOINT ["/usr/bin/tini", "--", "node", "/app/dist/container/lumi.cjs"]
CMD ["help"]
