# Test plan: README purpose only

No product behaviour changes. The proof is mechanical:

- [x] `apps/server/src/repository-shape/readme-run-block.test.ts` was red before the README rewrite and is green after it.
- [x] Every `pnpm` script, `--filter` package, `scripts/` path, environment variable, demo address, demo password and local port in the root README resolves against the sources.
- [x] No README other than the root one has a fenced block, a `pnpm` or `docker` command or an environment variable.
- [x] `apps/server/src/repository-shape/delivery-docs.test.ts`: every README link still resolves.
