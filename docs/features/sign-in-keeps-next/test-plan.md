# Test plan: Sign-in keeps the next path

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/web/src/features/auth/redirect-if-session.test.tsx::redirects a signed-in user to the next path it was sent from` — input: a signed-in session at `/sign-in?next=%2Fshare%2Ftoken-1`; expected: the share route renders, documents does not — evidence: red at 03cc665 in a throwaway worktree: 1 failed | 3 passed (4); green at cd290ff: 4 passed
- [x] Confirmed it fails for the right reason: `Unable to find an element with the text: share landing` (the component navigated to documents) — evidence: red run at 03cc665 printed `Unable to find an element with the text: share landing`, body showed `documents page`

## Unit

- [x] `redirect-if-session.test.tsx::ignores a next path on another origin` — input: `?next=https://evil.example/share/x`; expected: documents renders (pin: green before the change) — evidence: verbose run at cd290ff: passed; it also passed at 03cc665 (pin)
- [x] `redirect-if-session.test.tsx::redirects a signed-in user to documents` — input: no `next`; expected: documents (pin) — evidence: verbose run at cd290ff: passed; it also passed at 03cc665 (pin)

## E2E (Playwright specs)

- [x] `e2e/auth.spec.ts::a signed-out member who opens a share link lands on the document after signing in` — steps: owner uploads a document and reads its edit link; a second context, signed out, opens the link path; expected: URL `/sign-in?next=%2Fshare%2F…`, then after the form the URL matches `/documents/<id>` and the editor shows the first paragraph — evidence: not run by the tester (port 3100 busy); lead ran e2e/auth.spec.ts at cd290ff: 9 passed incl. this scenario (3.3s), log /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-agentic-test/28294bd5-eb62-4b30-9062-e3b26d359cf9/tasks/b9dvslshm.output; on main before the fix the same scenario landed on /documents (PR #31 body walk)

## Prove it for real — Playwright MCP

- [x] Happy path: signed out, open a share link, sign in as Bruno; expected: the document opens, Bruno appears as a member — evidence: Ana created a document and read the edit link; signed out; /share/<edit> redirected to /sign-in?next=%2Fshare%2F...; Bruno signed in and landed on /documents/ae0489cb-181b-4d1e-aea9-994ff16e7dcd; GET /api/documents listed it under shared with role editor, owner Ana; Bruno shown online in the header; .pr-media/sign-in-keeps-next/share-link-sign-in-next-1280.png, .pr-media/sign-in-keeps-next/document-after-sign-in-1280.png
- [x] Plain sign-in with no `next`; expected: `/documents` — evidence: Ana at /sign-in landed on /documents; .pr-media/sign-in-keeps-next/plain-sign-in-documents-1280.png
- [x] Foreign `next` (`?next=https://example.org/`); expected: `/documents` — evidence: /sign-in?next=https%3A%2F%2Fexample.org%2F, Bruno signed in, landed on /documents
- [x] Browser Back from the document after the redirect; expected: no loop back to the form — evidence: Back from the document went to /share/<token> which forwarded to the document again; second Back went to /documents; the sign-in form was never shown again (see edge case 1)
- [x] Console and network clean: zero console errors, zero failed requests other than the expected 401 before sign-in — evidence: console at error level: one entry, 401 on POST /api/auth/sign-in/email from the deliberate wrong password; every other request 200 (share accept, me, documents, members, timeline, summaries)
- [x] Narrow width (375) for the sign-in form; expected: form usable — evidence: 375px: form fits with no horizontal overflow, sign-in with next reached the document; .pr-media/sign-in-keeps-next/share-link-sign-in-next-375.png, .pr-media/sign-in-keeps-next/document-after-sign-in-375.png
- [x] Screenshots at `.pr-media/sign-in-keeps-next/` — evidence: 6 files in .pr-media/sign-in-keeps-next/ (no pre-change screenshots exist; the change is not visual)

## Edge cases found during execution

1. Back after the redirect: from the document, the first Back lands on `/share/<token>`, which accepts again and forwards to the document, so it takes two Backs to leave. Cause is the share landing route, not the sign-in form; the plan only requires no loop to the form, which held. Outcome: noted, not a defect of this fix.
2. Wrong password with `next`: the form shows `Invalid email or password.`, the URL keeps `?next=%2Fshare%2F...`, and the retry with the right password lands on the document. Outcome: passes.
3. Signed in, open `/sign-in?next=%2Fshare%2F<read token>` directly (wrapper path, not the submit): lands on the document. Outcome: passes.
4. Signed out `/sign-up?next=...` on a claimed instance shows `This invite is not valid. Ask an admin for a new link.`; sign-up with `next` cannot be exercised without an invite. Outcome: reasoned from `apps/web/src/app/router.tsx`, where both pages use the same wrapper.

## Adversarial review

- [x] Claim 1: no redirect loop is possible — attack: `?next=%2Fsign-in`, nested `next`, `//evil.example`, `/\evil.example`, `javascript:`; result: **held** — evidence: reviewer's scratch table at cd290ff, 8/8: two hops end at `/documents`, every probe stays in-app; tester: `/sign-in?next=%2Fsign-in` signed in → `/documents`
- [x] Claim 2: the submit's own `navigate(next)` and the wrapper's redirect agree — attack: read both call sites; result: **held** — evidence: both call `safeNextPath` on the same search param (use-auth-submit.ts, redirect-if-session.tsx); both still fire after sign-in (replace then push), which can accept a share link twice, harmless because `grant` is idempotent and never downgrades; the tester's Browser Back check saw the share landing once
- [x] Claim 3: the sign-up page (also wrapped) behaves the same — attack: `/sign-up?next=%2Fshare%2Ft` in the reviewer's scratch router; result: **held** — evidence: the share route rendered; router.tsx wraps SignUpPage in the same RedirectIfSession

## Coverage honesty

- Sign-up with `next` is covered by the same wrapper; no separate E2E.
