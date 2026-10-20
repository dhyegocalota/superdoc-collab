# Tester briefing: backpressure, refusal probe and queue sentence

## What changed

- The editor page asks the server again (`GET /api/documents/:id`, a query of its own) when the socket is denied access. A 503 with a sentence shows that sentence in the connection banner; a 403, 404, 200, 500 or a network failure keeps the access denied line; no reason is shown while the answer is awaited. Files: `use-refusal-probe.ts`, `connection-banner.tsx`, `document-page.tsx`.
- The page reloads once after `HEAVY_ROOMS_RETRY_AFTER_MS` for the budget sentence, and never for the per-user cap sentence. File: `use-heavy-rooms-retry.ts`.
- The 429 for a heavy upload picks its sentence from the owner's queue: both a running and a waiting document gives `BOOTSTRAP_QUEUE_FULL_MESSAGE`, only a waiting one gives `BOOTSTRAP_QUEUE_WAITING_MESSAGE`. Files: `room-bootstrap.ts`, `collaboration-runtime.ts`, `documents-routes.ts`.

## Red today, green after

| Test | Red commit | Failure text |
|---|---|---|
| `use-refusal-probe.test.tsx`, `connection-banner.test.tsx`, `document-page.test.tsx` | e9bd1f84 | the probe passed the failure through, so the 503 cases returned `access-denied` with no sentence |
| `use-heavy-rooms-retry.test.ts` per-user cap | ce1e2f06 | `expected "vi.fn()" to not be called at all, but actually been called 1 times` |
| `room-bootstrap.test.ts` running owner | ce1e2f06 | `Error: isRunningFor is not implemented` |
| `documents-heavy-routes.test.ts` waiting-only sentence | ce1e2f06 | the route answered the sentence about a document being prepared |

## Hypotheses for the tester

- A member who is denied at the socket while the budget is full sees the budget sentence in the banner and the page reloads by itself once.
- A member at the per-user cap sees the cap sentence and the page does not reload by itself.
- A revoked member still reads "Your access was removed".
- A third heavy upload by an owner with one running and one waiting job reads "one being prepared and another waiting"; with only a waiting job it reads "a document waiting".

## Gaps

- The browser walk of these paths was not run by the developer. `e2e/backpressure.spec.ts` passed once on port 3170 and covers the third-open refusal on the waiting page, not the banner after a socket denial.
