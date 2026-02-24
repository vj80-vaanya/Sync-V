#!/bin/bash
set -e

if [ "$SEED_DEMO_DATA" = "true" ]; then
  echo "Seeding demo data..."
  node dist/seed.js
fi

exec node dist/index.js
