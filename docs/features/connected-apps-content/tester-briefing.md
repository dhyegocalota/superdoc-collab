# Tester briefing: The Connected apps page carries the Use with AI content

## What changed

- `apps/web/src/features/connected-apps/use-with-ai-content.tsx`: new `UseWithAiContent({ title, canEdit })`, the client tabs and the "Then try asking" section extracted from the dialog.
- `use-with-ai-dialog.tsx`: renders `UseWithAiContent`; header, footer and focus return untouched.
- `connected-apps-page.tsx`: the section under the list shows `CONNECT_HEADING`, `USE_WITH_AI_DESCRIPTION` and `UseWithAiContent` with `title: null, canEdit: false`.
- `connect-snippets.tsx`: `ConnectSnippets` removed, `ClientSnippet` kept.
- `connected-apps-copy.ts`: `CONNECT_DESCRIPTION` and `MCP_URL_LABEL` removed; `rg` found no other user in apps/web or e2e.
- E2E files untouched: they read only `CONNECTED_APPS_HEADING` and `revokeLabel`, and `final-visuals.spec.ts` reads names that still exist.

## How to run

```
pnpm --filter @superdoc-collab/web exec vitest run src/features/connected-apps/use-with-ai-content.test.tsx
pnpm --filter @superdoc-collab/web exec vitest run src/features/connected-apps/connected-apps-page.test.tsx
pnpm --filter @superdoc-collab/web exec vitest run src/features/connected-apps/use-with-ai-dialog.test.tsx
```

## Red today, green after

| Commit | Test | Red failure text | Green |
|---|---|---|---|
| ea6ac67 | `use-with-ai-content.test.tsx`: all 3 tests | `Error: UseWithAiContent is not implemented` (3 failed) | 074bce5, 3/3 |
| 3d1c210 | `connected-apps-page.test.tsx::the page shows the client tabs, the description and the library prompts` | `Unable to find an element with the text: Connect your AI client once. It asks you to approve access the first time, then works on every document you can open.` | b366cb6, 15/15 |
| 3d1c210 | `::the ChatGPT instruction is visible after selecting the ChatGPT tab` | `expected document not to contain element, found <p` (instruction already visible, stacked) | b366cb6 |
| 3d1c210 | `::the stacked snippets are gone` | `expected document not to contain element, found <button` (the MCP URL copy button) | b366cb6 |
| 3d1c210 | `::the copy button of Claude Code / Cursor / ChatGPT copies its text` | `Unable to find role="tab" and name "Claude Code"` (same for Cursor, ChatGPT) | b366cb6 |

`use-with-ai-dialog.test.tsx` is unchanged and green at 7/7 before and after.

## Hypotheses to attack

- The dialog renders identically: the content wrapper is a `space-y-4` div inside the dialog grid, so spacing between tabs, prompts and footer could differ by a few pixels.
- The page shows exactly one snippet and one Copy button at a time, and selecting ChatGPT shows the instruction plus the URL.
- The empty-list message still renders above the content section.
- At 375 the three tabs and the long Cursor JSON snippet do not cause horizontal page scroll.
- Tab keyboard navigation (arrow keys) works on the page as in the dialog.

## Known gaps

- Not run: `pnpm --filter @superdoc-collab/web test:unit` in full, the E2E specs, any Playwright MCP walk. Targeted files and `pnpm typecheck` (including `tsc -p e2e`) are green.
- The page heading level: the section has an h2 and the tab snippets an h3, same as before for the snippets.
