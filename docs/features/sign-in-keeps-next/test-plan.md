# Test plan: Sign-in keeps the next path

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/auth/redirect-if-session.test.tsx::redirects a signed-in user to the next path it was sent from` — input: a signed-in session at `/sign-in?next=%2Fshare%2Ftoken-1`; expected: the share route renders, documents does not
- [ ] Confirmed it fails for the right reason: `Unable to find an element with the text: share landing` (the component navigated to documents)

## Unit

- [ ] `redirect-if-session.test.tsx::ignores a next path on another origin` — input: `?next=https://evil.example/share/x`; expected: documents renders (pin: green before the change)
- [ ] `redirect-if-session.test.tsx::redirects a signed-in user to documents` — input: no `next`; expected: documents (pin)

## E2E (Playwright specs)

- [ ] `e2e/auth.spec.ts::a signed-out member who opens a share link lands on the document after signing in` — steps: owner uploads a document and reads its edit link; a second context, signed out, opens the link path; expected: URL `/sign-in?next=%2Fshare%2F…`, then after the form the URL matches `/documents/<id>` and the editor shows the first paragraph

## Prove it for real — Playwright MCP

- [ ] Happy path: signed out, open a share link, sign in as Bruno; expected: the document opens, Bruno appears as a member
- [ ] Plain sign-in with no `next`; expected: `/documents`
- [ ] Foreign `next` (`?next=https://example.org/`); expected: `/documents`
- [ ] Browser Back from the document after the redirect; expected: no loop back to the form
- [ ] Console and network clean: zero console errors, zero failed requests other than the expected 401 before sign-in
- [ ] Narrow width (375) for the sign-in form; expected: form usable
- [ ] Screenshots at `.pr-media/sign-in-keeps-next/`

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: no redirect loop is possible — attack: `?next=%2Fsign-in`; result: <refuted | held>
- [ ] Claim 2: the submit's own `navigate(next)` and the wrapper's redirect agree — attack: read both call sites; result: <refuted | held>
- [ ] Claim 3: the sign-up page (also wrapped) behaves the same — attack: sign up with `next`; result: <refuted | held>

## Coverage honesty

- Sign-up with `next` is covered by the same wrapper; no separate E2E.
