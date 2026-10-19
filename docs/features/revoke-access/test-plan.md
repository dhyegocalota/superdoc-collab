# Test plan: Revoke a person's access

## The failing test first

- [ ] `documents-routes.test.ts::owner removes a reader` — input: DELETE by the owner for a reader; expected: 204, member gone from GET members
- [ ] Confirmed it fails for the right reason: <paste>

## Unit

- [ ] `documents-repository.test.ts::revoke removes one member and keeps the others`
- [ ] `documents-routes.test.ts::owner cannot remove themself` — expected: 400 with the message
- [ ] `documents-routes.test.ts::unknown member answers 404`
- [ ] `documents-routes.test.ts::an editor cannot remove anyone` — expected: 404
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
