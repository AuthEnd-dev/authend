# Vite admin → apps/admin/dist; API runs as TypeScript (Bun), not bundled
FROM oven/bun:1.3.11 AS builder
WORKDIR /app

# Optional. If unset/empty, the admin UI uses the browser origin at runtime (same host as the API).
# If the API is on another host, pass: --build-arg VITE_API_URL=https://api.example.com
ARG VITE_API_URL=
ENV VITE_API_URL=${VITE_API_URL}

COPY package.json bun.lock ./
COPY tsconfig.json tsconfig.base.json ./
COPY scripts ./scripts
COPY packages ./packages
COPY apps ./apps

RUN bun install --frozen-lockfile

RUN bun run --cwd apps/admin build

FROM oven/bun:1.3.11
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package.json /app/bun.lock ./
COPY --from=builder /app/tsconfig.json /app/tsconfig.base.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/apps/admin/dist ./apps/admin/dist

EXPOSE 3000

CMD ["bun", "run", "--cwd", "apps/api", "start"]
