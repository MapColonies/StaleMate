ARG NODE_VERSION=24.13.1

# Base image for all stages
FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME/bin:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable


FROM base AS pruner
WORKDIR /app
ARG APP_NAME

RUN pnpm add -g turbo
COPY . .
RUN turbo prune ${APP_NAME} --docker


FROM base AS builder
WORKDIR /app
ARG APP_NAME

COPY --from=pruner /app/out/json/ .

RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

RUN pnpm turbo build --filter ${APP_NAME}...

# An app's folder isn't named after its package (apps/ui holds stalemate-ui), so ask pnpm where it is.
RUN cp -r "$(pnpm --filter ${APP_NAME} exec pwd)/dist" /prod-dist

# The SPA's deep-link fallback and cache headers live in the umbrella chart's configmap, which the nginx chart mounts as a location extension.
FROM acrarolibotnonprod.azurecr.io/common/nginx:v2.4.0 AS runner

COPY --from=builder /prod-dist /usr/share/nginx/html
