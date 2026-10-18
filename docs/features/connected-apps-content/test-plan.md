# Test plan: The Connected apps page carries the Use with AI content

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [x] `apps/web/src/features/connected-apps/use-with-ai-content.test.tsx::tabs show one client at a time` — input: render with `title: null`; expected: the Claude Code snippet visible, the Cursor and ChatGPT snippets absent until their tab is selected — evidence: red ea6ac67 (3 failed), green 074bce5, tip 2cbc862, content 3/3 in /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-targeted.log
- [x] Confirmed it fails for the right reason: `UseWithAiContent is not implemented` — evidence: throwaway worktree at ea6ac67 printed `Error: UseWithAiContent is not implemented`, 3 failed (3), log /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-red-ea6ac67.log; at 3d1c210 the page file printed 6 failed | 9 passed, log /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-red-3d1c210.log, texts match the briefing

## Unit

- [x] `use-with-ai-content.test.tsx::without a title the library prompts show` — input: `title: null, canEdit: false`; expected: the two library prompts under "Then try asking" — evidence: pass at 2cbc862, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-targeted.log
- [x] `use-with-ai-content.test.tsx::an editor sees three document prompts` — input: `title: 'Plan', canEdit: true`; expected: three prompts naming "Plan", the third the fix prompt — evidence: pass at 2cbc862; walk showed 3 items for owner of Plan in the editor dialog, .pr-media/connected-apps-content/after-editor-dialog-1280.png
- [x] `connected-apps-page.test.tsx::the page shows the client tabs, the description and the library prompts` — input: a list with no apps (the test renders an empty list); expected: the three tabs, the Claude Code snippet, the two library prompts, the description `USE_WITH_AI_DESCRIPTION` — evidence: pass at 2cbc862 (test is named 'the page shows the client tabs, the description and the library prompts'), /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-targeted.log
- [x] `connected-apps-page.test.tsx::the ChatGPT instruction is visible after selecting the ChatGPT tab` — input: click the ChatGPT tab; expected: the instruction and the URL snippet — evidence: pass at 2cbc862, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-targeted.log
- [x] `connected-apps-page.test.tsx::the stacked snippets are gone` — input: initial render; expected: no "MCP URL" label and only one snippet visible — evidence: pass at 2cbc862, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-targeted.log
- [x] `use-with-ai-dialog.test.tsx` unchanged; expected: 7/7 green — evidence: 7/7 green at 2cbc862, file untouched since ac3efef, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-targeted.log
- [x] `pnpm --filter @superdoc-collab/web test:unit`; expected: green — evidence: 803 passed (803), exit 0, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-web-unit.log; pnpm typecheck exit 0 incl. e2e, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-typecheck.log

## E2E (Playwright specs)

- [x] `e2e/agent.spec.ts` and `e2e/auth.spec.ts` — steps: the specs that open Connected apps; expected: green, unmodified; `e2e/final-visuals.spec.ts` "Use with AI opens a dialog…": green, unmodified; new `e2e/final-visuals.spec.ts` "the Connected apps page shows a tab per client and the library prompts": ana opens the page, sees the three tabs and the library prompts, selects ChatGPT and sees `CHATGPT_INSTRUCTION` — evidence: agent.spec 4/4 and auth.spec 10/10 green with the scratch config on 3400/3499 at 2cbc862, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-e2e-agent.log and ca-e2e-auth.log; final-visuals 'Use with AI' dialog test 1/1, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-e2e-fv-dialog.log

## Prove it for real — Playwright MCP

- [x] Happy path: sign in as ana, open Documents, press Use with AI, press Manage connected apps; expected: the page shows the same tabs and prompts as the dialog, plus the list of connected apps — evidence: scripted walk (Playwright MCP servers busy), /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-walk.log, dialog on Documents then Manage connected apps lands on /settings/connected-apps; dialog and page show the same 3 tabs and 2 library prompts plus the connected app row, .pr-media/connected-apps-content/after-page-with-app-1280.png
- [x] Tabs on the page: select Cursor, then ChatGPT; expected: one snippet at a time, the ChatGPT instruction under its tab, and the Copy button reads `COPIED_LABEL` after a click on each — evidence: pass at 2cbc862, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-targeted.log
- [x] Empty list: sign in as a user with no connected apps (a fresh demo user, or ana after revoking); expected: the empty message above the content section — evidence: scripted walk: the empty message sits above the Connect an AI client heading, also after revoking the app, .pr-media/connected-apps-content/after-page-empty-1280.png, .pr-media/connected-apps-content/after-page-after-revoke-1280.png
- [x] Console and network clean: zero console errors, zero failed requests — evidence: scripted walk: console errors [] and failed API responses [] across the whole flow, .pr-media/connected-apps-content/after-console-network.txt
- [x] Desktop width 1280 and narrow width 375; expected: at 375 the tabs wrap without horizontal page scroll, snippets wrap — evidence: scripted walk: scrollWidth equals innerWidth at 1280 and 375 on Documents with dialog open and on the page for every tab and with an app row; tablist 252px wide fits in 375; Cursor JSON wraps, .pr-media/connected-apps-content/after-page-cursor-375.png, .pr-media/connected-apps-content/after-page-chatgpt-375.png, .pr-media/connected-apps-content/after-page-with-app-375.png
- [ ] BLOCKED (video only): screenshots at `.pr-media/connected-apps-content/`; video at `.pr-media/connected-apps-content/walkthrough.mp4` — evidence: screenshots listed under .pr-media/connected-apps-content/ (after-* and before-*, 1280 and 375); BLOCKED for the video: walkthrough.mp4 needs the recorder role (ffmpeg, release upload) and a Playwright MCP recording, not run by the tester

## Edge cases found during execution

Run notes: the walk was scripted (both Playwright MCP servers in use), spec kept at /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/ca-walk-source/; no defects found. Observation, not a defect: each tab repeats its client name as the snippet label right under the tab.

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [x] Claim 1: the dialog is unchanged for the user — attack: diff the rendered dialog before and after; result: before/after dialog screenshots at 1280 and 375 for Claude Code, Cursor and ChatGPT: pixel diff 0 in 5 of 6, 1 pixel of 2.96e-06 in chatgpt at 375; dialog box 560x448 and 343x552 identical, .pr-media/connected-apps-content/before-*.png vs after-*.png (baseline built from ac3efef)
- [x] Claim 2: nothing else imported `ConnectSnippets`, `CONNECT_DESCRIPTION` or `MCP_URL_LABEL` — attack: grep the web app and e2e; result: rg for the three names over apps, libs, e2e finds nothing outside docs/features (historical final-visuals design and briefing)
- [x] Claim 3: the E2E agent helpers still find the URL — attack: run `e2e/agent.spec.ts`; result: agent.spec 4/4 green, openConnectedApps and revoke helpers still find the heading and the row, /private/tmp/claude-501/-Users-dhyegocalota-orca-workspaces-superdoc-take-home-final-visuals/3482769f-2fc2-4b3a-9594-26daaf8cc628/scratchpad/logs/ca-e2e-agent.log

## Coverage honesty

What is not tested and why.

- The copy of the snippets is pinned by the existing copy test, not by the new content test.
