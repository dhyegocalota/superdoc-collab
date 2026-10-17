#!/bin/sh
set -eu

if [ "${SEED_DEMO_USERS-}" != "true" ] && [ "${SEED_DEMO_USERS-}" != "false" ]; then
  echo "SEED_DEMO_USERS must be true or false, received: '${SEED_DEMO_USERS-}'" >&2
  exit 1
fi

if [ "$SEED_DEMO_USERS" = "true" ] && [ -z "${DEMO_PASSWORD-}" ]; then
  echo "Missing environment variable: DEMO_PASSWORD (required when SEED_DEMO_USERS=true)" >&2
  exit 1
fi

if [ "$SEED_DEMO_USERS" = "true" ]; then
  node dist/seed.js
fi

exec node dist/main.js
