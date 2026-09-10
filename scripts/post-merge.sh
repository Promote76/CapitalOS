#!/bin/bash
set -euo pipefail
pnpm install --frozen-lockfile
pnpm --filter @workspace/db push
psql "$DATABASE_URL" \
  --no-psqlrc \
  --set ON_ERROR_STOP=1 \
  --file lib/db/migrations/0053_restore_audit_archive.sql
