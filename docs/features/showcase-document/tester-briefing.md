# Tester briefing: Showcase document

## What changed and where

- Content and dates: `libs/history/src/showcase/` (`showcase-content.ts` base paragraphs, `showcase-bursts.ts` the 18 bursts, `showcase-paragraphs.ts` `buildShowcaseParagraphs({ now })` shifting whole days so the last edit lands on the UTC day before `now`). `SHOWCASE_TITLE`, `SHOWCASE_API_PATH` live in `libs/types/src/showcase.ts`.
- Creation: `apps/server/src/documents/showcase-documents.ts` (`ShowcaseDocuments.create`) over the new shared `store-document.ts`, which `documents-routes.ts` now also uses (extraction only). Wired as `services.showcase`.
- Callers: `POST /api/admin/showcase` in `admin-routes.ts`; `createSignUpGate` takes an optional `createShowcase`, called after `claimAdmin` succeeds, failures logged with `console.error`, never thrown.
- Web: `showcase-button.tsx` in Admin → Users heading row, copy in `admin-copy.ts`, call in `admin-api.ts`; invalidates the documents list query.
- Seams added outside the ownership list (needed, minimal): `startServer({ createShowcaseOnClaim = true })` in `server.ts`; `startTestServer({ showcaseOnClaim = false })` in `testing/test-server.ts` so the ~hundreds of existing tests keep an admin with no documents; `libs/history/src/index.ts` exports. `seed.ts` creates no showcase (no `createShowcase` passed), so the seeded Docker demo and the E2E stack get none on claim.
- README: one sentence after the Quick install sign-in paragraph (the README has no "Try it" heading in this tree).

## Run

```
pnpm --filter @superdoc-collab/history exec vitest run src/showcase/showcase-paragraphs.test.ts
pnpm --filter @superdoc-collab/server exec vitest run src/documents/showcase-documents.test.ts
pnpm --filter @superdoc-collab/server exec vitest run src/admin/admin-routes.test.ts
pnpm --filter @superdoc-collab/server exec vitest run src/auth/sign-up-gate.test.ts
pnpm --filter @superdoc-collab/web exec vitest run src/features/admin/admin-page.test.tsx
pnpm test:e2e e2e/showcase.spec.ts
```

## Red today, green after

| Test | Red failure text | Commit |
|------|------------------|--------|
| showcase-paragraphs.test.ts (8) | `Error: buildShowcaseParagraphs is not implemented` | 0cd3d7fd |
| showcase-documents.test.ts (3) | `Error: ShowcaseDocuments.create is not implemented` | 0cd3d7fd |
| admin-routes.test.ts (2 new) | `expected 404 to be 201`; `expected [] to have a length of 2 but got +0` | 7d67c94c |
| sign-up-gate.test.ts (2 new) | `expected [] to deeply equal [ 'SuperDoc Collab: a guided tour' ]` | 7d67c94c |
| admin-page.test.tsx (3 new) | `Unable to find role="button" and name "Create the showcase document"` | 7a6eb249 |

Pins (green when landed): the admin guard rows for the showcase route in `admin-routes.test.ts`, and the storage-failure sign-up test in `sign-up-gate.test.ts`.

## Burst table

Eighteen bursts in UTC from `SHOWCASE_START` (Monday 2026-03-02, shifted by whole days at creation). Each burst is three edits one minute apart.

| Day | Bursts (time, author) |
|-----|-----------------------|
| 1 | 09:10 Ana, 11:40 Bruno, 14:25 Caio, 17:05 Dani |
| 2 | 09:30 Bruno, 12:15 Ana, 15:50 Dani |
| 3 | 08:55 Caio, 10:45 Dani, 13:30 Bruno, 16:20 Ana |
| 4 | 09:20 Dani, 11:10 Caio, 14:40 Ana |
| 5 | 09:00 Bruno, 11:35 Ana, 14:15 Caio, 16:45 Dani |

Smallest gap between the end of one burst and the start of the next is 1 h 48 min.

## Hypotheses for the tester

- Pressing the Admin button makes a document titled "SuperDoc Collab: a guided tour" owned by the caller, and it appears in the list without a reload.
- Opening it shows four contributors (Ana Lima, Bruno Costa, Caio Souza, Dani Alves) once the import projection ends, and the chart marks at least one idle break.
- No event is dated after the creation moment; the last one is on the previous UTC day.
- A second press makes a second document.
- The first sign-up on an unclaimed instance started without the seed finds the showcase in its list; a failing storage never fails that sign-up.
- Topic names appear through the existing pipeline (fake model in tests); with no key the existing unavailable state shows.

## Gaps

- The fresh-stack first-sign-up E2E is not written: every E2E stack is seeded (`seed.ts` claims the admin), and no helper starts an unclaimed stack. The claim path is covered at unit level in `sign-up-gate.test.ts` (`startTestServer({ claim: false, showcaseOnClaim: true })`). The E2E covers the admin button, the list, four contributors and a chart break divider.
- The Playwright MCP walk, the 375 px check and the adversarial attacks in `test-plan.md` are the tester's.
- The break divider element is a zero-size SVG line, so the E2E counts it rather than asserting visibility.
- Not run: the full server suite. Only the files above, `documents-routes.test.ts` (53 passed) and `pnpm typecheck` (green).
