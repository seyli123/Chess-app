# Build from repo root: docker build -f server/Dockerfile .
FROM node:20-alpine AS base
WORKDIR /app

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
