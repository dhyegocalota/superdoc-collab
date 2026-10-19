# Tester briefing: Showcase document

## What changed and where

- Content and dates: `libs/history/src/showcase/` (`showcase-content.ts` base paragraphs, `showcase-sessions.ts` the ten sessions, `showcase-phrases.ts` the sentence parts, `showcase-paragraphs.ts` `buildShowcaseParagraphs({ now })` shifting whole days so the last edit lands on the UTC day before `now`). `SHOWCASE_TITLE`, `SHOWCASE_API_PATH` live in `libs/types/src/showcase.ts`.
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

## Session table

The history is generated from `showcase-sessions.ts`: ten sessions (a morning and an afternoon on each of five days), 150 to 175 minutes long, two or three authors each, an edit every 6 to 15 minutes (ramp, peak, tail), about 180 tracked changes in total, a deletion every fourth edit. Times are UTC from `SHOWCASE_START` (Monday 2026-03-02, shifted by whole days at creation).

| Day | Morning (start, minutes, authors) | Afternoon (start, minutes, authors) |
|-----|-----------------------------------|-------------------------------------|
| 1 | 09:00, 165, Ana Bruno Caio | 13:00, 160, Bruno Dani Ana |
| 2 | 09:05, 170, Caio Dani Ana | 13:05, 165, Bruno Caio |
| 3 | 08:55, 160, Dani Bruno Ana | 13:05, 170, Caio Dani Bruno |
| 4 | 09:00, 175, Ana Caio | 12:55, 160, Dani Ana Bruno |
| 5 | 09:00, 165, Bruno Caio Dani | 13:05, 150, Ana Dani Caio |

Lunch gaps are 60 to 90 minutes between sessions, nights are the other gaps. At 1280 px the scenario stack chart shows ten swelling shapes with nine dashed dividers (screenshot `.pr-media/showcase-document/timeline-1280.png`, git-ignored).

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

## Tester run 2026-10-19

- Walked the admin button twice, the list, the showcase timeline at 1280 and 375, the bins of the four authors and one summary. Hypotheses held except the in-place list refresh (not tested) and the visible four contributors (the top edits row shows three).
- Defects: none blocking. Minor: the top edits avatar row caps at three without an overflow marker, hiding the fourth showcase author. Console errors: none.
