# Test plan: AI presence avatar

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/server/src/agent/agent-sessions.test.ts::a person's AI is present while a tool call runs and for the linger after it` — input: a tool call that has not ended, then one ended 59 s and 61 s ago; expected: present, present, absent
- [ ] Confirmed it fails for the right reason: `presentUserIds is not implemented`, not a broken test

## Unit

- [ ] `agent-sessions.test.ts` — two people's AIs on one document; expected: both present; a third document lists neither
- [ ] `collaboration-runtime.test.ts` — only an agent socket of Ana is open; expected: `onlineUserIds` does not contain Ana
- [ ] `documents-routes` members — Ana's AI present; expected: `agents` has one entry with Ana's id, name "Ana · AI", Ana's colour slot, `online: true`
- [ ] Edge: the AI of a removed member — expected: not listed
- [ ] `members.test.tsx` — Ana is the current user and her AI is present; expected: two avatars, "Ana, online" and "Ana's AI, online"
- [ ] `members.test.tsx` — an agent avatar is not a button and has no jump description

## E2E (Playwright specs)

- [ ] `e2e/agent.spec.ts::the AI shows beside its owner after it edits` — steps: Ana opens a document, her AI client edits; expected: "Ana's AI, online" appears next to Ana's avatar

The disappearance after the linger is covered by `apps/server/src/agent/agent-sessions.test.ts::a person's AI is present while a tool call runs and for the linger after it ends` (fake clock), not by E2E.

## Prove it for real — Playwright MCP

- [ ] AI edits while the owner is online: expected: two avatars, the owner and "Owner's AI"
- [ ] AI edits while the owner is offline: expected: Bruno, a member, sees only the AI avatar; the owner is not shown online
- [ ] 60 s after the last tool call: expected: the AI avatar is gone within the next members poll
- [ ] Two users' AIs edit: expected: two distinct agent avatars, each labelled with its person
- [ ] Revoked consent: expected: the AI avatar is gone after the linger
- [ ] The AI avatar is not focusable as a jump target; Tab skips it
- [ ] Reload mid-edit: expected: the avatar reappears after the reload while the linger lasts
- [ ] Console and network clean: zero console errors, zero failed requests
- [ ] Desktop width: expected: humans then AIs in one row, AIs sit after the humans and the +N menu, never inside it
- [ ] Narrow width (375 px): expected: humans collapse to three with the +N menu, the AI avatar stays beside them
- [ ] Screenshots at `.pr-media/ai-presence-avatar/`; video at `.pr-media/ai-presence-avatar/walk.webm`

## Edge cases found during execution

Empty on purpose.

## Adversarial review

- [ ] Claim 1: the owner is offline when only the AI is connected — attack: AI edit with no human tab, read the members as another member; result: 
- [ ] Claim 2: the avatar leaves after the linger — attack: read members at 59 s and 61 s; result: 
- [ ] Claim 3: the owner's own AI is never deduplicated — attack: owner with several tabs; result: 

## Coverage honesty

- Public visitors are another lane's feature.
