# Plan: The Connected apps page carries the Use with AI content

**Spec:** spec.md
**Tier:** 🟢
**Seam:** `apps/web/src/features/connected-apps/`: the dialog and the page share one content component.
**Assumptions (decided, owner can override):**
- The page keeps its own heading ("Connect an AI client") and takes the dialog's description; the dialog keeps its title.
- The MCP URL block leaves the page because the ChatGPT tab shows the URL with the instruction.

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G1 | `apps/web/src/features/connected-apps/use-with-ai-content.tsx`, `use-with-ai-content.test.tsx`, `use-with-ai-dialog.tsx`, `connected-apps-page.tsx`, `connected-apps-page.test.tsx`, `connect-snippets.tsx`, `connected-apps-copy.ts`, `connected-apps-copy.test.ts`, `e2e/agent.ts`, `e2e/agent.spec.ts`, `e2e/auth.spec.ts` (selectors only) | `developer-ca` |

## Sequencing

One group.

## Steps

### G1

- [x] **Step 1:** red unit test `use-with-ai-content.test.tsx` and the stub; commit the red test alone. — evidence: ea6ac67
- [x] **Step 2:** `UseWithAiContent` extracted; the dialog renders it; dialog tests green. — evidence: 074bce5, dialog 7/7, content 3/3
- [x] **Step 3:** red page test (tabs and library prompts on the page); then the page change, the removal of `ConnectSnippets` and of the unused copy; green. — evidence: red 3d1c210, green b366cb6, page 15/15
- [x] **Step 4:** E2E selectors adapted where they read the stacked snippets; `pnpm typecheck`; tester briefing. — evidence: no E2E file reads the removed block (rg), E2E files untouched; typecheck green; tester-briefing.md

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 3 | an E2E reads the MCP URL from the removed block | `e2e/agent.ts` or `auth.spec.ts` fails on a missing "MCP URL" label | the ChatGPT tab shows the URL; the helper selects the tab first |
| 3 | the copy test pins the removed constants | `connected-apps-copy.test.ts` fails on an import | the test drops the pin in the same commit |

**Steps with no backout:** none.

## Z. Prove and ship

- [x] **Tester briefing:** a developer wrote `tester-briefing.md`.
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **Security reviewer:** a fresh `security-reviewer` sub-agent returned a verdict on this diff.
- [ ] **/check-ui:** screenshots of the page at 1280 and 375 and the video.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
