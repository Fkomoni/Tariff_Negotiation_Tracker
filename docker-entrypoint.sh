#!/bin/sh
# Applies any pending database migrations, then starts the app. If migrations
# fail the container exits non-zero and never serves - so an orchestrator
# (CCE/Kubernetes or an ECS restart policy) keeps the previous version running
# instead of booting a build whose schema is behind its code.
#
# On Kubernetes you may instead run migrations as an init container or a Job
# and skip this step in the app container (set RUN_MIGRATIONS=false); see
# HANDOVER.md. Here it runs inline, which is the simplest correct default for a
# single-container (ECS) deploy.
set -e

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "[entrypoint] applying database migrations..."
  node scripts/migrate-deploy.mjs
else
  echo "[entrypoint] RUN_MIGRATIONS=false - skipping migrations (handled elsewhere)."
fi

echo "[entrypoint] starting server on port ${PORT:-3000}..."
exec node server.js
