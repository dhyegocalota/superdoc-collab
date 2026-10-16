#!/bin/sh
set -eu

if [ "${SEED_DEMO_USERS:-false}" = "true" ]; then
  node dist/seed.js
fi

exec node dist/main.js
