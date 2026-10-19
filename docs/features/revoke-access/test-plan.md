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

- [x] Two browsers: the flow above; also Bruno typing when removed loses the keystroke and sees the unavailable state — evidence: edit-link variant on a document with Ana (owner) and Bruno (editor): Ana Remove gave DELETE 204, People list dropped Bruno and Ana's avatars went from 2 to 1 online at once; Bruno typed " LOST" right after: his page showed "This document is no longer available. Back to documents" within 159 ms and the text never reached Ana's page ("Bruno typedAna was here!" unchanged); Bruno's list no longer showed it and the direct URL showed the same unavailable page; read-link variant: same on a second document; screenshots .pr-media/testing/revoke-access-people-1280.png, revoke-access-bruno-unavailable-1200.png
- [x] Bruno accepts the same link again → he is back as a reader (documented behaviour) — evidence: edit link accepted again: Bruno back as editor, text visible, caret present; read link accepted again: back as reader, text "Reader doc by Ana" visible, no caret, document listed under Shared with me
- [x] Console and network clean apart from Bruno's expected 404 members poll and 4404 socket close — evidence: Bruno's console: only the 404 members poll errors (3 in the first walk, 2 in the second) after removal; Ana's console 0 errors; DELETE 204
- [x] Desktop and 375 px: the People section wraps, no horizontal scroll — evidence: 375: share dialog 343 px wide inside a 375 viewport, scrollWidth 375, dialog scrollWidth = clientWidth (341); People row Ana Owner / Bruno Can view, Remove visible; screenshot .pr-media/testing/revoke-access-people-375.png

## Adversarial review

- [x] Claim 1: an editor cannot call the route — attack: call it as Bruno; result: — evidence: Bruno (editor) DELETE members of Ana: 403 {"error":"Forbidden"}; of himself: 403; owner of the owner: 400 "The owner cannot be removed."; unknown id: 404 "This person does not have access."
- [x] Claim 2: the removed user's socket is closed, not just the row — attack: keep Bruno's socket open, remove, send an update; result: — evidence: Bruno's open page flipped to the unavailable state at 159 ms with no reload and his keystrokes did not reach Ana's page; the socket frame itself was not observed (the socket lives in a worker)
- [ ] Claim 3: no agent tool bypasses the removal — attack: read `share-tools.ts`; result:

## Coverage honesty

- Agent sockets of the removed user are closed by the same runtime call; not exercised end to end.

## Edge cases found during execution

- A removed reader gets the same unavailable page when opening the document URL directly; no editor chrome renders.
- Owner removing a member while that member's avatar is online removes the avatar in the same tick (no 5 s wait).
- Not walked: a failed removal (offline) keeps the row, because browser offline emulation does not reach the fetch-free paths reliably in this tool; claim 3 (share-tools.ts) not read.
