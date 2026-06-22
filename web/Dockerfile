# Build from repo root: docker build -f web/Dockerfile .
# Debian base (matching the API image) so the build output never references
# node:20-alpine. The web service doesn't use Prisma, so the base is cosmetic
# here, but keeping both images on Debian avoids confusion.
FROM node:20-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY web/package.json web/

RUN npm install

COPY packages/shared packages/shared
COPY web web

WORKDIR /app/web
EXPOSE 5173
# Dev server is fine for this slice; swap for `npm run build` + a static server later.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
