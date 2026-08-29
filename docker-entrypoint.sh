#!/bin/sh
set -e

# The database a container starts against may be several migrations behind the
# code inside it — that is the normal state of affairs right after a deploy.
# Applying them here rather than by hand is what keeps a redeploy a single
# step. `migrate deploy` only ever applies what is missing and never rewrites
# history, and it takes an advisory lock first, so two containers starting at
# the same moment cannot race each other through the same migration.
#
# Run from apps/api because prisma.config.ts names its schema and migrations
# with paths relative to that directory.
echo "==> prisma migrate deploy"
cd /app/apps/api
node_modules/.bin/prisma migrate deploy
cd /app

echo "==> starting BidNest API on port ${PORT:-4000}"
# exec, so the API replaces this shell and becomes PID 1: it then receives
# SIGTERM from the platform directly. Without it the shell swallows the signal,
# the graceful shutdown never runs, and the container is killed on a timeout
# with requests still in flight.
exec node apps/api/dist/src/main.js
