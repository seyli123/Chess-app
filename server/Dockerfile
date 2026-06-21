# Build from repo root: docker build -f server/Dockerfile .
FROM node:20-alpine AS base
WORKDIR /app

# Prisma's query/schema engines are dynamically linked against OpenSSL and the
# GNU libc compat shim. The Alpine base image ships neither, which produces
# "Please manually install OpenSSL" / "Could not parse schema engine response".
RUN apk add --no-cache openssl libc6-compat

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
