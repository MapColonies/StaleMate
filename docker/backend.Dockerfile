ARG NODE_VERSION=26.13.0
# Keep in sync with packageManager in package.json.
ARG PNPM_VERSION=10.28.1

# Base image for all stages
FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ARG PNPM_VERSION
RUN npm install -g pnpm@${PNPM_VERSION}


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

RUN pnpm --filter ${APP_NAME} deploy --prod --legacy /prod-app


FROM node:${NODE_VERSION}-alpine AS runner
RUN apk add dumb-init

ENV NODE_ENV=production

COPY --from=builder /prod-app /app

WORKDIR /app/dist

# The heap stays under the chart's 256Mi memory limit, so V8 collects before the pod is OOMKilled.
CMD ["dumb-init", "node", "--max_old_space_size=192", "--import", "./instrumentation.mjs", "./index.js"]
