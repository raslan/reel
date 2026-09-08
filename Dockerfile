# syntax=docker/dockerfile:1

# --- build: install deps + build the frontend ---
FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY tsconfig.json vite.config.ts ./
COPY server ./server
COPY web ./web
RUN bun run build   # tsc --noEmit -p web && vite build --outDir public
RUN bun install --frozen-lockfile --production   # prune to runtime deps

# --- runtime ---
FROM oven/bun:1.3.14-alpine
RUN apk add --no-cache ffmpeg
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server ./server
COPY --from=build /app/public ./public
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["bun", "run", "server/server.ts"]
