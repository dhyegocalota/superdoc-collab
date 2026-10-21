# Test plan: AI presence avatar

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/server/src/agent/agent-sessions.test.ts::a person's AI is present while a tool call runs and for the linger after it` — input: a tool call that has not ended, then one ended 59 s and 61 s ago; expected: present, present, absent — evidence: agent-sessions.test.ts 21/21 green on head dfb45ec4
- [ ] Confirmed it fails for the right reason: `presentUserIds is not implemented`, not a broken test

## Unit

- [x] `agent-sessions.test.ts` — two people's AIs on one document; expected: both present; a third document lists neither — evidence: agent-sessions.test.ts 21/21 green
- [x] `collaboration-runtime.test.ts` — only an agent socket of Ana is open; expected: `onlineUserIds` does not contain Ana — evidence: collaboration-runtime.test.ts 14/14 green
- [x] `documents-routes` members — Ana's AI present; expected: `agents` has one entry with Ana's id, name "Ana · AI", Ana's colour slot, `online: true` — evidence: members-routes.test.ts 5/5 green; walk payload agents [{name 'Ana · AI', colorSlot 6, online true}]
- [x] Edge: the AI of a removed member — expected: not listed — evidence: members-routes.test.ts covers a present non-member id (not listed); a literally removed member was not walked
- [x] `members.test.tsx` — Ana is the current user and her AI is present; expected: two avatars, "Ana, online" and "Ana's AI, online" — evidence: members.test.tsx 25/25 green
- [x] `members.test.tsx` — an agent avatar is not a button and has no jump description — evidence: members.test.tsx 25/25 green; walk: AI avatar is a SPAN, no tabindex, 0 of 40 Tab stops

- [ ] Pin: `apps/server/src/agent/agent-document-tools.test.ts::list_members returns the members with their roles and presence` — input: no human socket open; expected: every member offline, as `list_members` now reads human sockets only

## E2E (Playwright specs)

- [x] `e2e/agent.spec.ts::the AI shows beside its owner after it edits` — steps: Ana opens a document, her AI client edits; expected: "Ana's AI, online" appears next to Ana's avatar — evidence: agent.spec.ts 5/5 passed

The disappearance after the linger is covered by `apps/server/src/agent/agent-sessions.test.ts::a person's AI is present while a tool call runs and for the linger after it ends` (injected clock), not by E2E.

## Prove it for real — Playwright MCP

- [x] AI edits while the owner is online: expected: two avatars, the owner and "Owner's AI" — evidence: scripted walk: header shows Ana, Bruno, Ana's AI; .pr-media/ai-presence-avatar/owner-online-with-ai-desktop.png
- [x] AI edits while the owner is offline: expected: Bruno, a member, sees only the AI avatar; the owner is not shown online — evidence: scripted walk: Ana online:false, Ana's AI listed; Bruno header B, Ana's AI, Bruno's AI, no Ana avatar; .pr-media/ai-presence-avatar/owner-offline-only-ai-desktop.png. Transient: an 'Ana, online' button was counted once right after Ana closed, before the next poll
- [x] 60 s after the last tool call: expected: the AI avatar is gone within the next members poll — evidence: scripted walk: Ana's AI absent from members at +60.7 s, UI avatar gone at +61.7 s
- [x] Two users' AIs edit: expected: two distinct agent avatars, each labelled with its person — evidence: scripted walk: both AIs on Ana's header; .pr-media/ai-presence-avatar/two-ais-desktop.png
- [x] Revoked consent: expected: the AI avatar is gone after the linger — evidence: scripted walk: revoked AI stayed listed until +60.0 s after its last call, then absent
- [x] The AI avatar is not focusable as a jump target; Tab skips it — evidence: scripted walk: SPAN, no tabindex, 0/40 Tab stops
- [x] Reload mid-edit: expected: the avatar reappears after the reload while the linger lasts — evidence: scripted walk: avatar visible again after reload
- [x] Console and network clean: zero console errors, zero failed requests — evidence: scripted walk, both pages: zero console errors, zero responses >= 400
- [x] Desktop width: expected: humans then AIs in one row, AIs sit after the humans and the +N menu, never inside it — evidence: owner-online-with-ai-desktop.png: humans then AI; +N menu not exercised (two humans only)
- [ ] ~~Narrow width (375 px): expected: humans collapse to three with the +N menu, the AI avatar stays beside them~~ Struck by the lead on 2026-10-21: below 640 px the members row is hidden by the existing header layout, which this feature does not change — BLOCKED: at 375 px the whole members row is hidden (`hidden sm:block` in editor-header.tsx, as before the change); .pr-media/ai-presence-avatar/owner-online-with-ai-narrow.png
- [ ] Screenshots at `.pr-media/ai-presence-avatar/`; video at `.pr-media/ai-presence-avatar/walk.webm` — 20 screenshots saved at 1280 and 375; no video, the walk was scripted

## Edge cases found during execution

- At 375 px the members row is hidden by the existing layout, so the narrow expectation cannot be met; owner decision: show the AI avatar at 375 or drop the expectation.
- Revoking consent leaves the AI avatar until the linger ends.
- The walk was scripted (Playwright MCP shared with other testers).

## Adversarial review

- [x] Claim 1: the owner is offline when only the AI is connected — attack: AI edit with no human tab, read the members as another member; result:  — evidence: holds: Ana online:false with only her AI connected, AI listed
- [x] Claim 2: the avatar leaves after the linger — attack: read members at 59 s and 61 s; result:  — evidence: holds: still listed when polled each second before, absent at +60.0 to +60.7 s
- [x] Claim 3: the owner's own AI is never deduplicated — attack: owner with several tabs; result:  — evidence: holds: two owner tabs plus repeated AI calls give one Ana member, one Ana AI, one avatar per tab

## Coverage honesty

- Public visitors are another lane's feature.
