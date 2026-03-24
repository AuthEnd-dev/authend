# Full-stack image: Vite admin → apps/admin/dist, bundled API → apps/api/dist (serves /admin + /api)
FROM oven/bun:1.2.5 AS builder
WORKDIR /app

# Baked at build time. Default empty = browser-relative URLs (same host as /admin). Override: docker build --build-arg VITE_API_URL=https://api.example.com .
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json bun.lock ./
COPY tsconfig.json tsconfig.base.json ./
COPY scripts ./scripts
COPY packages ./packages
COPY apps ./apps

RUN bun install --frozen-lockfile

RUN bun run --cwd apps/admin build

RUN bun run --cwd apps/api build \
  && mkdir -p apps/api/db/migrations \
  && cp -r apps/api/src/db/migrations/core apps/api/db/migrations/

FROM oven/bun:1.2.5
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/db ./apps/api/db
COPY --from=builder /app/apps/admin/dist ./apps/admin/dist

EXPOSE 3000

CMD ["bun", "apps/api/dist/index.js"]
