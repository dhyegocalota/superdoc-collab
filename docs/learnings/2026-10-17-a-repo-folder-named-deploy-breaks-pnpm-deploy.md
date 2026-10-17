# A repository folder named `deploy/` breaks `pnpm deploy` inside the image build

- Date: 2026-10-17
- Inspired by: slice 5 planning (`docs/features/deploy/plan.md`, Task 1 ordering); reproduced with pnpm 8.15.9 in a throwaway build
- Revisited: 2026-10-17 — the Dockerfile writes the pruned package to `/workspace/release` and `.dockerignore` excludes `deploy`
- Revisited: 2026-10-17 — still true; the test moved from `apps/server/src/deploy/` to `apps/server/src/repository-shape/` (refinement-structure) so the server folder no longer shares the name

## Signal
The multi-stage build fails with `ERR_PNPM_DEPLOY_DIR_NOT_EMPTY` the moment a `deploy/` folder (compose files, runbooks) is committed, although nothing in the application changed.

## Cause
`pnpm deploy <dir>` refuses a non-empty target; the Dockerfile used `/workspace/deploy` as that target while `COPY . .` had just copied the repository's `deploy/` folder into the same path.

## Do
Give `pnpm deploy` a target that cannot collide with a repository path (`/workspace/release`), exclude the deployment folder from the build context, and keep the install layer (`package.json` files, lockfile, workspace file) before `COPY . .` so the cache survives doc-only changes; land the Dockerfile change before the folder that would collide.

## Anchor
`docker/Dockerfile`, `.dockerignore`, `apps/server/src/repository-shape/dockerfile.test.ts`
