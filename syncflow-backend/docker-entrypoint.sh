#!/bin/sh
# docker-entrypoint.sh
# Runs inside the container on every start.
# 1. Waits for the Postgres container to accept connections.
# 2. Applies any pending Prisma migrations (safe to re-run; idempotent).
# 3. Starts the compiled Node.js server.

set -e

echo "[entrypoint] Applying Prisma migrations..."
npx prisma migrate deploy

echo "[entrypoint] Starting SYNCFLOW backend..."
exec node dist/server.js
