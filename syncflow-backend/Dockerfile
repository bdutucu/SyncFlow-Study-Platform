# ─── Stage 1: Builder ────────────────────────────────────────────────────────
# Installs all deps (including devDeps), generates the Prisma client, and
# compiles TypeScript to dist/. The devDeps never make it to the final image.
FROM node:20-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

# Copy manifests first so Docker caches the npm install layer when only
# source files change.
COPY package*.json ./
RUN npm ci

# Copy Prisma schema and generate the client before building so tsc can
# resolve @prisma/client types.
COPY prisma ./prisma
RUN npx prisma generate

# Compile TypeScript → dist/
COPY tsconfig.json ./
COPY src ./src
RUN npm run build


# ─── Stage 2: Runner ─────────────────────────────────────────────────────────
# Lean production image: only the compiled JS, production node_modules, and
# the Prisma migration artefacts needed at runtime.
FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

# Re-install production deps only (no devDeps, ~50% smaller node_modules).
COPY package*.json ./
RUN npm ci --omit=dev

# Copy compiled output and Prisma files.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma

# Entrypoint script: waits for the DB, applies pending migrations, then
# starts the application.
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
