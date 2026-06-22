# Build from repo root: docker build -f server/Dockerfile .
#
# Debian (bookworm) base rather than Alpine: Prisma's *schema engine* (used by
# `prisma db push` / migrate) selects its binary at runtime from a libssl
# detection that is unreliable on Alpine/musl — it fails to detect OpenSSL,
# falls back to a non-existent openssl-1.1.x engine, and crashes with
# "Could not parse schema engine response". Debian + OpenSSL 3 is detected
# correctly, which is the supported, reliable setup for Codespaces/CI.
FROM node:20-bookworm-slim AS base
WORKDIR /app

# OpenSSL (libssl) is required by Prisma's engines; ca-certificates lets the
# Prisma CLI download its engine binaries over HTTPS at build time.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Workspace manifests
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY server/package.json server/

RUN npm install

# Sources
COPY packages/shared packages/shared
COPY server server

RUN npm run build -w @chess/shared \
  && npx prisma generate --schema server/prisma/schema.prisma \
  && npm run build -w server

WORKDIR /app/server
EXPOSE 3000
# `db push` syncs the schema without committed migration files (fine for this
# slice). Switch to `prisma migrate deploy` once you commit real migrations.
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && node dist/main.js"]
