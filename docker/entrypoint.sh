#!/bin/sh
set -eu

CGROUP_V2_LIMIT_FILE=${CGROUP_V2_LIMIT_FILE-/sys/fs/cgroup/memory.max}
CGROUP_V1_LIMIT_FILE=${CGROUP_V1_LIMIT_FILE-/sys/fs/cgroup/memory/memory.limit_in_bytes}
SERVER_HEAP_PERCENT=70
WORKER_HEAP_PERCENT=50
BYTES_PER_MEGABYTE=1048576
UNLIMITED_CGROUP_BYTES=4611686018427387904

memory_limit_bytes() {
  for limit_file in "$CGROUP_V2_LIMIT_FILE" "$CGROUP_V1_LIMIT_FILE"; do
    [ -r "$limit_file" ] || continue
    limit=$(cat "$limit_file")
    case "$limit" in
      ''|*[!0-9]*) return 0 ;;
    esac
    [ "$limit" -lt "$UNLIMITED_CGROUP_BYTES" ] && echo "$limit"
    return 0
  done
}

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

limit_bytes=$(memory_limit_bytes)

if [ -z "$limit_bytes" ]; then
  echo "memory limit none, heap node default"
  exec node dist/main.js
fi

limit_megabytes=$((limit_bytes / BYTES_PER_MEGABYTE))
server_heap_megabytes=$((limit_megabytes * SERVER_HEAP_PERCENT / 100))
export PROJECTION_WORKER_HEAP_MEGABYTES=$((limit_megabytes * WORKER_HEAP_PERCENT / 100))
echo "memory limit $limit_megabytes MB, heap $server_heap_megabytes MB"
exec node --max-old-space-size="$server_heap_megabytes" dist/main.js
