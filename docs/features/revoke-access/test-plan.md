# Test plan: Revoke a person's access

## The failing test first

- [ ] `member-removal-routes.test.ts::owner removes a reader` — input: DELETE by the owner for a reader; expected: 204, member gone from GET members
- [x] Confirmed it fails for the right reason (red commit d41146f0): `AssertionError: expected 404 to be 204 // Object.is equality` for `owner removes a reader`; `expected [ 404, { error: 'Not found' } ] to deeply equal [ 400, … ]` for the owner self case; `expected null to deeply equal { code: 4404, … }` for the socket close; repository: `Error: revoke is not implemented`; runtime: `Error: closeUserConnections is not implemented`; web (17725e44): `Unable to find role="group" and name "People with access"`

## Unit

- [ ] `documents-repository.test.ts::revoke removes one member and keeps the others`
- [ ] `member-removal-routes.test.ts::owner cannot remove themself` — expected: 400 with the message
- [ ] `member-removal-routes.test.ts::unknown member answers 404`
- [ ] `member-removal-routes.test.ts::an editor cannot remove anyone` — expected: 403 (the guard answers 403 to a member below the role and 404 to a non-member)
- [ ] runtime: `closeUserConnections` closes only that user's connections with 4404 and the reason
- [ ] `share-dialog.test.tsx`: members listed with role labels; owner row has no Remove; Remove calls the API and invalidates the members key; failure shows the message

## E2E (Playwright specs)

- [ ] `e2e/revoke-access.spec.ts::the owner removes a reader who loses the document at once` — Ana shares the read link, Bruno accepts and opens; Ana removes Bruno; expected: Bruno sees the unavailable state within the members poll, his list no longer shows the document, Ana's member avatars no longer show Bruno

## Prove it for real — Playwright MCP

- [ ] Two browsers: the flow above; also Bruno typing when removed loses the keystroke and sees the unavailable state
- [ ] Bruno accepts the same link again → he is back as a reader (documented behaviour)
- [ ] Console and network clean apart from Bruno's expected 404 members poll and 4404 socket close
- [ ] Desktop and 375 px: the People section wraps, no horizontal scroll

## Adversarial review

- [ ] Claim 1: an editor cannot call the route — attack: call it as Bruno; result:
- [ ] Claim 2: the removed user's socket is closed, not just the row — attack: keep Bruno's socket open, remove, send an update; result:
- [ ] Claim 3: no agent tool bypasses the removal — attack: read `share-tools.ts`; result:

## Coverage honesty

- Agent sockets of the removed user are closed by the same runtime call; not exercised end to end.
