#!/bin/sh
set -e

if [ -f /app/.env ]; then
  set -a
  . /app/.env
  set +a
fi

echo "Syncing Prisma schema to database..."
prisma db push --skip-generate

echo "Backfilling existing tree owners..."
node ./prisma/backfill-tree-members.mjs

echo "Starting Next.js server..."
exec node server.js
