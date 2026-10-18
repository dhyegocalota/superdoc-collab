# Test plan: The Connected apps page carries the Use with AI content

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `apps/web/src/features/connected-apps/use-with-ai-content.test.tsx::tabs show one client at a time` — input: render with `title: null`; expected: the Claude Code snippet visible, the Cursor and ChatGPT snippets absent until their tab is selected
- [ ] Confirmed it fails for the right reason: `UseWithAiContent is not implemented`

## Unit

- [ ] `use-with-ai-content.test.tsx::without a title the library prompts show` — input: `title: null, canEdit: false`; expected: the two library prompts under "Then try asking"
- [ ] `use-with-ai-content.test.tsx::an editor sees three document prompts` — input: `title: 'Plan', canEdit: true`; expected: three prompts naming "Plan", the third the fix prompt
- [ ] `connected-apps-page.test.tsx::the page shows the client tabs and the library prompts` — input: a list with one app; expected: the tabs, the Claude Code snippet, the two library prompts, the description `USE_WITH_AI_DESCRIPTION`
- [ ] `connected-apps-page.test.tsx::the ChatGPT instruction is visible after selecting the ChatGPT tab` — input: click the ChatGPT tab; expected: the instruction and the URL snippet
- [ ] `connected-apps-page.test.tsx::the stacked snippets are gone` — input: initial render; expected: no "MCP URL" label and only one snippet visible
- [ ] `use-with-ai-dialog.test.tsx` unchanged; expected: 7/7 green
- [ ] `pnpm --filter @superdoc-collab/web test:unit`; expected: green

## E2E (Playwright specs)

- [ ] `e2e/agent.spec.ts` and `e2e/auth.spec.ts` — steps: the specs that open Connected apps or read the MCP URL; expected: green with the selectors adapted to the tab

## Prove it for real — Playwright MCP

- [ ] Happy path: sign in as ana, open Documents, press Use with AI, press Manage connected apps; expected: the page shows the same tabs and prompts as the dialog, plus the list of connected apps
- [ ] Tabs on the page: select Cursor, then ChatGPT; expected: one snippet at a time, the ChatGPT instruction under its tab, Copy works on each
- [ ] Empty list: a user with no connected apps; expected: the empty message above the content section
- [ ] Console and network clean: zero console errors, zero failed requests
- [ ] Desktop width 1280 and narrow width 375; expected: the tabs wrap or scroll without horizontal page scroll, snippets wrap
- [ ] Screenshots at `.pr-media/connected-apps-content/`; video at `.pr-media/connected-apps-content/walkthrough.mp4`

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: the dialog is unchanged for the user — attack: diff the rendered dialog before and after; result:
- [ ] Claim 2: nothing else imported `ConnectSnippets`, `CONNECT_DESCRIPTION` or `MCP_URL_LABEL` — attack: grep the web app and e2e; result:
- [ ] Claim 3: the E2E agent helpers still find the URL — attack: run `e2e/agent.spec.ts`; result:

## Coverage honesty

What is not tested and why.

- The copy of the snippets is pinned by the existing copy test, not by the new content test.
