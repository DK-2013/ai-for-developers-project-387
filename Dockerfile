FROM node:26-alpine AS base
RUN npm install -g pnpm@12.18.0
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/spec/package.json packages/spec/package.json
COPY packages/server/package.json packages/server/package.json
COPY packages/web/package.json packages/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm codegen \
  && pnpm --filter @calendar/web build \
  && pnpm --filter @calendar/server build \
  && pnpm --filter @calendar/server --prod deploy /out/server \
  && cp -r packages/server/drizzle /out/server/drizzle \
  && cp -r packages/web/dist /out/web

# The default target. Compose and Render set DATABASE_URL and use an external
# PostgreSQL. Without one the server still starts, keeps /healthz at 200, and
# retries migrations and the seed until the database becomes reachable.
FROM base AS runtime
ENV NODE_ENV=production \
    WEB_DIST=/app/web
WORKDIR /app

COPY --from=build /out/server /app/server
COPY --from=build /out/web /app/web

USER node
EXPOSE 3000
CMD ["node", "server/dist/index.js"]
