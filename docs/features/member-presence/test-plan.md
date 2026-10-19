# Test plan: Member presence

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `members.test.tsx::a peer with no rendered caret leaving refreshes the members query` — input: an `awareness-update` with a removed peer and no caret; expected: one `invalidateQueries` with `{ cancelRefetch: false }` after the debounce — evidence: red at c637a309 in a throwaway worktree, 1 failed | 13 passed, `expected "invalidateQueries" to be called with arguments: [ { queryKey: [ 'documents', …(2) ] } ]`, log scratchpad/presence-walk/red-c637a309.log; green at 24f8cbfa
- [ ] `members.test.tsx::a member with a live position is named Bruno, online and described by Go to Bruno’s cursor` — expected: the button name is `Bruno, online` — BLOCKED: the lock rule allowed one red-first run (c637a309) and one unit run; the briefing's red text is unconfirmed
- [ ] `timeline-notices.test.tsx::the empty copy stays hidden while the log is ahead of the last timeline answer`, `timeline-panel.test.tsx::a document edited after the last timeline answer does not say it has no edits`, `superdoc-editor.test.tsx::reports every editor update to the page`, `use-last-edit-at.test.ts` — BLOCKED: these tests landed at 17:10 to 17:12, after the single unit run (scratchpad/presence-walk/unit.log, 17:05, 58 files 601 tests green on the earlier tip); the behaviour is proven in the browser on 02edd153 (Edits probe below), the unit files need one green run on the final tip
- [ ] `timeline-notices.test.tsx::no empty copy while the projection is behind` — input: no bins, `isBehind: true`; expected: no "No edits yet"
 — BLOCKED: red-first not run (one red run allowed); the test changed after fc899840, so the briefing's red text is stale
- [ ] `members.test.tsx::a burst of presence changes during a members fetch invalidates once without cancelling it` — input: five awareness updates during an in-flight members fetch; expected: one `invalidateQueries` with `{ cancelRefetch: false }`, one fetch — BLOCKED: landed after the single unit run; browser evidence on 02edd153: during 14 s of Bruno typing Ana saw only the 5 s poll (4248, 9251 ms) and Bruno only his own poll (4871, 9880 ms), scratchpad/presence-walk/walk-tip2b.log

## Unit

- [ ] `members.test.tsx::an awareness update where nobody came or went leaves the members query alone`, `members.test.tsx::a peer arriving refreshes the members query`, `members.test.tsx::a peer who reconnects without a caret is refreshed on arrival and again on leave` (pin: green when it landed)
- [ ] `e2e/final-visuals.spec.ts::a member who signs out reads offline for the others before the members poll would say so` — Ana waits for a members response, then Bruno signs out; expected: Ana's button for Bruno reads "Bruno" within `FAST_LEAVE_DEADLINE_MS` (`MEMBERS_PRESENCE_DEBOUNCE_MS` + 1.5 s = 2.5 s). The next poll is `MEMBERS_REFRESH_MS` (5 s) after that response, so only the invalidation can meet the deadline and the test is red without it every run; this E2E is the proof of defect 1
- [ ] `timeline-notices.test.tsx::empty copy shows when there are no bins and the projection caught up` — expected: "No edits yet" shown — BLOCKED: see the unit line below; in the browser the copy shows on a fresh document before any key (15 samples, last 57 ms before the first keystroke, scratchpad/presence-walk/walk-tip2b.log)
- [ ] the web unit files `members.test.tsx`, `use-member-cursors.test.ts`, `timeline-notices.test.tsx`, `timeline-panel.test.tsx`; expected: green — BLOCKED: one unit run only; scratchpad/presence-walk/unit.log is green (58 files, 601 tests) but predates the commits from 784fc116 to 02edd153, so it does not prove the final tip

## Prove it for real — Playwright MCP

The E2E above is the proof of the fast leave; the walk rows below are the user-facing record.

- [x] Ana and Bruno open a document, Dani joins and signs out; expected: within a poll tick both headers show Dani without the online dot — evidence: on 02edd153 (stack rebuilt from the tip, Bruno leaving Ana's document) the online state left Ana's header in 1053 to 1139 ms in 9 of 9 trials with a prior online state (the debounce, not the 5 s poll), and 1068 ms in the walk; the leaver stays listed as "Bruno" described by "Bruno is offline", no online dot; Dani was played by Bruno. Screenshots .pr-media/member-presence/tester/after-bruno-sign-out-1280.png and after-bruno-sign-out-375.png; logs scratchpad/presence-walk/signout-trials-tip2.log, scratchpad/presence-walk/walk-tip2b.log. History: on fc899840 this box FAILED, 5057 to 5144 ms in 9 of 16 trials, because the refetch fired by the caret leaving still returned him online (scratchpad/presence-walk/signout-trials.txt, signout-trials2.txt)
- [x] Reload Bruno's page; expected: in Ana's header Bruno is named "Bruno, online", the tooltip says "Go to Bruno’s cursor" once the caret paints — evidence: on 02edd153 Ana's header read "Bruno, online" described by "Go to Bruno’s cursor" 98 ms after his first keystroke, "Bruno, online" described by "Bruno’s cursor is off screen" while he is connected without a caret, and "Bruno" described by "Bruno is offline" for 0.9 s right after the reload; at +3000 ms after the reload it reads "Bruno, online"; one name per state, never a "Go to" label as a name. Screenshots .pr-media/member-presence/tester/after-bruno-reload-1280.png; log scratchpad/presence-walk/walk-tip2b.log
- [x] Ana types in a new document with the Edits panel open; expected: "No edits yet" never shows once she has typed — evidence: on 02edd153 0 of 115 panel samples (every 100 ms, 10 s) showed "No edits yet" from the first keystroke on; the panel goes blank at +51 ms and shows the bins at +3745 ms. Screenshots .pr-media/member-presence/tester/edits-panel-after-typing-1280.png and -375.png; logs scratchpad/presence-walk/walk-tip2b.log, scratchpad/presence-walk/panel-tip2.log (0 samples). History: on fc899840 the copy stayed up to 654 ms after the first keystroke (scratchpad/presence-walk/walk-run3.txt)

- [ ] `e2e/final-visuals.spec.ts` member avatar jump case and two-colours case locate the button as "Bruno, online" / "Ana, online"; expected: green — BLOCKED: the lock rule forbids the E2E inside the lane; the gate runs it

## Edge cases found during execution

- Bruno reloads while Ana watches. On fc899840 Ana's header named him "Bruno" (offline) for 5 s, until the poll, although his page was ready after 820 ms; outcome: DEFECT, fixed by the debounced refetch, on 02edd153 he is offline for 0.9 s and back online by +1.1 s. Evidence: scratchpad/presence-walk/walk-run3.txt, scratchpad/presence-walk/walk-tip2b.log. A regression test for the reconnecting-without-a-caret case is still requested.
- A peer who joins and types shows "Bruno, online" about 2.1 s after his first keystroke on 02edd153 (join plus the 1 s debounce); outcome: pass, noted. Evidence: scratchpad/presence-walk/walk-tip2b.log
- Fresh document, first keystroke: on fc899840 "No edits yet" stayed up to 654 ms after the key; on 02edd153 it never shows after the key. Outcome: fixed. Evidence: scratchpad/presence-walk/panel-run1.txt, scratchpad/presence-walk/panel-tip2.log
- Reload of the document page with edits present: "No edits yet" shown 0 times over 10 s. Outcome: pass. Evidence: scratchpad/presence-walk/panel-tip2.log
- First trial of the sign-out series had no prior online state (latency 82 ms is not a measurement). Evidence: scratchpad/presence-walk/signout-trials-tip2.log
- Console errors and non-2xx API responses for Ana and Bruno across the whole walk: none. Evidence: scratchpad/presence-walk/walk-tip2b.log
- Narrow width 375: the top bar shows Rename, Share, More actions and Account and no member buttons, so presence cannot be seen there. Evidence: .pr-media/member-presence/tester/ana-sees-bruno-online-375.png
- Topics read "Topics unavailable" with the fake model on the walk's fresh documents; unrelated to this feature.

## Adversarial review

- [x] Claim: the members query is not refetched when a peer only moves, renames or recolours its caret, and a burst of awareness frames starves neither the poll nor an in-flight fetch — attack: type as Bruno for 10 s and watch the requests — evidence: on 02edd153 14 s of Bruno typing with a moving caret produced only the 5 s polls (Ana 4248 and 9251 ms, Bruno 4871 and 9880 ms) and no extra members request; scratchpad/presence-walk/walk-tip2b.log

## Coverage honesty

- The poll window itself is timing-dependent; the unit test pins the invalidation, not the clock.
