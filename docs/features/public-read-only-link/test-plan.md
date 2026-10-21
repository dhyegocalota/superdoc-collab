# Test plan: Public read-only link

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/server/src/documents/public-link-routes.test.ts::an owner switches a document public and reads the flag back` — input: owner `PUT /api/documents/:id/public {isPublic:true}`; expected: 200 `{isPublic:true}` and `GET` returns the same
- [ ] `apps/server/src/collaboration/public-socket-writes.test.ts::an update from a public connection is never applied to the room nor appended to the log` — input: a visitor socket inserts text; expected: the room text and the update log unchanged
- [ ] Confirmed each fails for the right reason: the message `... is not implemented` or the missing route status, recorded in `tester-briefing.md`

## Unit

- [ ] `apps/server/src/documents/public-link-routes.test.ts::a new document is private and its flag is read and written per document` — input: a new document; expected: `isPublic` false; after `setPublic(true)` true; another document stays false
- [ ] `apps/server/src/documents/public-link-routes.test.ts` — input: editor, reader, stranger, signed-out call `PUT .../public`; expected: 403, 403, 404, 401
- [ ] `apps/server/src/documents/public-link-routes.test.ts` — input: `PUT` with body `{isPublic:"yes"}`, `{}` and no body; expected: 400 and the flag unchanged
- [ ] `libs/types/src/public-link.test.ts` — input: the same visitor id twice, two different ids; expected: same animal and colour for the same id; `Anonymous <Animal>` name from the enum
- [ ] `apps/server/src/collaboration/public-room-tokens.test.ts` — input: a token for document A used for B, an expired token, an agent token, a bootstrap token, a public token presented as an agent token; expected: all refused
- [ ] `apps/server/src/insights/insights-repository.test.ts` — input: three filter keys with different `updated_at`, one a failure, none; expected: the newest usable sentence with its date; a failure-only document gives null
- [ ] `apps/server/src/public/public-routes.test.ts` — input: `GET /api/public/:id` for a missing id and for a flag-off document; expected: the same status and the same body
- [ ] `apps/server/src/public/public-routes.test.ts` — input: `GET /api/public/:id` with the flag on, no cookie; expected: 200 `access: visitor`, `viewer.name` is `Anonymous <Animal>`, a room token, and no `@` anywhere in the body
- [ ] `apps/server/src/public/public-routes.test.ts` — input: the same call signed in as a non-member; expected: the real name, `animal` null
- [ ] `apps/server/src/public/public-routes.test.ts` — input: the same call signed in as a member; expected: `access: member`, no token
- [ ] `apps/server/src/public/public-routes.test.ts` — input: the call on an uncommitted room; expected: 503 with `Retry-After`; `openBudget` untouched on every call
- [ ] `apps/server/src/public/public-routes.test.ts` — input: `PUBLIC_READS_PER_MINUTE + 1` calls from one address; expected: the last is 429 with `Retry-After`
- [ ] `apps/server/src/public/public-allowlist.test.ts` — input: POST, PUT, PATCH, DELETE on `/api/public/:id` and `/api/public/:id/summary`, and `POST /api/documents/:id/summaries/selection` without a session; expected: 404 and 401, no trigger (topics, summarize, scheduler, versions, job budget) called
- [ ] `public-allowlist.test.ts` — input: `GET` of every document resource (timeline, topics, versions, events, download, members, share links, summaries, thumbnail) and of the document itself, with a room token as bearer and no session; expected: 401 each, no trigger called
- [ ] `apps/server/src/collaboration/public-socket.test.ts` — input: placeholder, garbage, expired, another document, agent token, private document, missing and foreign Origin, uncommitted room; expected: refused each
- [ ] `apps/server/src/collaboration/public-socket.test.ts` — input: a valid token; expected: connected, `connection.readOnly` true, no `document_members` row for the visitor, the members list is the owner only
- [ ] `apps/server/src/collaboration/public-socket.test.ts` — input: `PUBLIC_SOCKET_ADMISSIONS_PER_MINUTE + 1` upgrades from one address; expected: the last answered 429
- [ ] `apps/server/src/collaboration/public-flag-off.test.ts` — input: the owner switches the flag off while a visitor is connected; expected: the visitor socket closes with the access-revoked code; the same token cannot join again
- [ ] `apps/server/src/collaboration/public-socket-writes.test.ts` — input: a visitor announces awareness; expected: silenced, the member's awareness holds no entry of the visitor
- [ ] `apps/web/src/features/sharing/public-link-section.test.tsx` and `public-page.test.tsx` — the Share dialog switch (read, switch on and off, refused, not loaded, copy) and the public page (view only, no tools, socket path and token, summary card or none, member redirect, not available, 429, preparing, access denied, connection failure and reload)

## E2E (Playwright specs)

- [ ] `e2e/public-link.spec.ts::an anonymous reader sees the text live and cannot type` — steps: owner switches public and types; an anonymous context opens `/public/:id`; expected: the text appears, typing changes nothing, the `View only` chip shows
- [ ] `e2e/public-link.spec.ts::the latest summary shows` — steps: owner summarizes; anonymous opens; expected: the summary card shows the stored sentence
- [ ] `e2e/public-link.spec.ts::turning the flag off disconnects` — steps: anonymous viewing; owner switches off; expected: the anonymous page shows the not-found state
- [ ] `e2e/public-link.spec.ts::visitors and online people` (step 15) — steps: owner and anonymous both open; expected: the owner row shows `Anonymous <Animal>`; the anonymous page shows the owner online

## Prove it for real — Playwright MCP

- [ ] Happy path with two browsers (owner, anonymous): owner opens Share, switches `Anyone with the link can view`, copies the link; anonymous opens it; expected: the Reader view, `View only`, live text as the owner types
- [ ] Flag off → not found: anonymous opens `/public/:id` for a document never made public; expected: the not-found state, same as a random UUID
- [ ] Flag toggled off while viewing: owner switches off; expected: the anonymous page leaves the document within five seconds
- [ ] Anonymous update dropped: anonymous clicks into the text and types; expected: nothing is inserted anywhere, the owner's text unchanged
- [ ] Public POST summarize refused: from the anonymous page console, `fetch('/api/documents/<id>/summaries/selection', {method:'POST'})`; expected: 401
- [ ] Timeline and topics unreachable: the same console fetch for `/timeline` and `/topics`; expected: 401 each
- [ ] No emails in the payload: network tab of the public page; expected: no `@` in any response
- [ ] Rate limit hit: reload the public page past the window; expected: the rate-limit copy and `Retry-After` honoured
- [ ] Member redirect: the owner opens `/public/:id` signed in; expected: the page lands on `/documents/:id`
- [ ] Signed-in non-member: a third user opens the link; expected: their real name and avatar, still read-only
- [ ] No summary → no card: a document never summarized; expected: no summary card on the public page
- [ ] Console and network clean: zero console errors, zero failed requests other than the deliberate refusals above
- [ ] Desktop width 1280 and narrow width 375: the public page lays out without horizontal scroll
- [ ] Screenshots at `.pr-media/public-read-only-link/`; video beside them

## Edge cases found during execution

From the security review (each has its regression test):

- [ ] `awareness-scrub.test.ts`, `public-socket-guards.test.ts::a visitor receives the awareness of a member without the email or the ids` — input: a member sets awareness `user` with id, email, name, colour and `userId`; expected: the visitor's awareness state for that member holds name and colour, a pseudonym id and no email, and the member's own state still holds the email and the id
- [ ] `public-socket-guards.test.ts::a visitor that sends a broadcast stateless message is closed and nobody receives it` — input: a visitor sends message type BroadcastStateless; expected: closed with 1008 and `PUBLIC_MESSAGE_REASON`, the member's `stateless` handler never called
- [ ] `public-socket-guards.test.ts::a visitor message of type %s is closed` — input: Stateless, SyncStatus, Auth; expected: closed with 1008
- [ ] `public-socket-guards.test.ts::a visitor frame over the public size cap closes the socket` — input: a frame of `PUBLIC_MAX_SOCKET_MESSAGE_BYTES + 1`; expected: close code 1009
- [ ] `keyed-sliding-window.test.ts` — input: more keys than `maxKeys`; expected: the least recently used key is forgotten, a recently used one survives
- [ ] `client-address.test.ts::addressWindowKeyOf` — input: IPv6 addresses of one /64 written in different ways, of two /64s, IPv4, IPv4-mapped, loopback, a zone id; expected: one key per /64, IPv4 unchanged
- [ ] Playwright MCP: the visitor's network tab and websocket frames carry no `@` and no member id after the owner (with an email) has typed

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: a visitor can never write — attack: send a raw sync update on the public socket, with and without `readOnly`; result:
- [ ] Claim 2: nothing public starts model, projection or version work — attack: walk every route under `/api` without a session and count worker jobs; result:
- [ ] Claim 3: a missing id and a flag-off id are indistinguishable — attack: compare status, body, headers and timing; result:

## Coverage honesty

What is not tested and why.

- The per-address window keeps one window per address in memory — the helper is shared with the upload budget; the accepted risk is memory growth under an address-rotating flood, bounded by the rate of new addresses a single host can present.
- Real SuperDoc rendering of a visitor's cursor colour — only the Playwright walk sees it.
