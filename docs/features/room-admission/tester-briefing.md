# Tester briefing: Room admission

Written by the developer sub-agents when their steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## G5 (developer-5): measurement and E2E

### What changed

- `e2e/room-admission.spec.ts` (new): five tests, one browser context per author through `signedInContext`. They assert HTTP answers on the open route and `data-testid="document-editor"`, never waiting-page copy.
- `docs/features/room-admission/plan.md`: Step 0 evidence and ticks for Steps 19 to 23.

### Step 0 measurement (unchanged tree, built stack with the fake model)

| Quantity | Value |
|---|---|
| DOCX uploaded | 9,991,684 bytes (9.53 MiB), a stored zip with one 9,988,911-byte noise PNG |
| Frames sent / received on the first sync | 45 / 79 |
| Largest frame sent | 9,989,690 bytes |
| Largest frame received | 9,989,690 bytes |
| Cap `MAX_SOCKET_MESSAGE_BYTES` | 41,943,040 bytes |

The cap leaves 4.2 times headroom. The image travels as one frame right after about 24 small frames, and the commit marker follows in three small frames. The probe was a throwaway Playwright spec outside the repository. The same generator lives in the spec as `buildLargeDocx`.

### How to run

```bash
pnpm exec playwright test room-admission
E2E_SLOW=1 pnpm exec playwright test room-admission
```

`pnpm test:e2e -- room-admission` ignores the filter and runs every spec. `E2E_SLOW=1` enables the 60 s expiry test, which is skipped without it. The stack boots through `playwright.config.ts`, so it needs port 3100 and 3299 free.

### Red today, green after

Failure text is what the run printed on commit `ed459e0`, on the tree before G1 to G4.

| Test (`e2e/room-admission.spec.ts::`) | Red before the change because | Green after because |
|---|---|---|
| `two editors open a fresh document at once and only the first is answered Create` | `Expected length: 1`, `Received length: 2`, array of two `{"roomMode": "create", "status": 200}` | the second concurrent open is answered 409 |
| `the second editor's open is answered 200 Join once the creator commits` | `Expected: 409`, `Received: 200` on the first open response of the second editor's page | the second editor waits, then the poll sees 200 Join and the reload shows the editor |
| `a creator who closes its tab mid-create leaves no duplicated paragraph for the next editor` | `expect(locator).toBeVisible() failed`, the paragraph never renders in 60 s. The page shows the failed editor with "This collaboration room is structurally invalid and was not opened." | the uncommitted room loads empty, the second editor seeds it and the paragraph appears once |
| `a 10 MB DOCX commits and reopens as Join` | pin: green today (4 s) | pin: stays green after the payload cap of Step 8 |
| `a superseded creator's socket closes with 4403 after the 60 s expiry` | `closeCode`: expected 4403, received null after the 60 s poll | the takeover closes the old socket with 4403 |

### Hypotheses to attack

1. Hypothesis: only one of two simultaneous opens is answered Create. Break it by: fire the two opens from two contexts in `Promise.all` 50 times on one fresh document each, and count Create answers.
2. Hypothesis: the creator's tab closing releases the reservation, so the next editor needs no wait. Break it by: close the creator's tab during the first sync and open as the second editor within 2 s, inside the store debounce.
3. Hypothesis: a 10 MB DOCX syncs below the cap. Break it by: a DOCX of exactly 10 MiB, and one whose room state is larger than the file (many tracked changes).
4. Hypothesis: a takeover after expiry fences the old creator. Break it by: let the old creator type after 4403, and reload it. Expect 409 until the new creator commits.
5. Hypothesis: the E2E would catch a regression that serves Create twice. Break it by: revert only the 409 branch for editors and confirm the first test goes red.

### Known gaps

- Step 21 cannot cut a real creator mid-stream. Chromium runs the collaboration socket in a worker, which `routeWebSocket` does not intercept, and closing the page at the large frame still lets the commit land (all 5 completed probe runs committed). The test copies the log rows that precede the commit of a real creator's document into a fresh document, through `history.sqlite` in `E2E_DATABASE_DIR`. It then opens that document as the second editor. The abandoned prefix is genuine creator output, but the cut is simulated.
- The plan predicted duplicated paragraphs for Step 21. On the current tree the second editor instead meets a room that SuperDoc rejects as structurally invalid, most likely because the creator's bootstrap claim in the room meta stays pending. The review focus about seeding on top of an abandoned partial may not occur the way it is written. The test is red either way and goes green only if the uncommitted room loads empty.
- Step 23 holds the creator with a raw in-page WebSocket that sends only the authentication message, so it does not exercise a real editor tab. It checks that the old socket closes with 4403 and does not check the failed banner.
- `SUPERSEDED_ATTEMPT_CLOSE_CODE` is a local constant in the spec because G1 has not landed in this lane. Replace it with the import from `libs/types` after the merge.
- The spec holds the DOCX generator and the raw socket helper. Moving them to `e2e/` helper files is a mechanical follow-up the lead can order.
- The two-window waiting page at 375 and 1280 px from the spec's E2E list is not covered here, because the waiting page belongs to final-visuals.
