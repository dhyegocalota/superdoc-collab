# The Connected apps page carries the Use with AI content

**Status:** Approved
**Tier:** 🟢
**Owner approval:** approved 2026-10-18 ("faz tambem a pagina connected apps ter o mesmo conteudo do modal use with ai")
**ADRs:** none
**Not changing:** the list of connected apps and Revoke; the MCP snippets themselves; the dialog's trigger, footer and focus return; the routes.

## Problem

The Use with AI dialog (opened from the documents list and from a document) shows one client at a time in tabs (Claude Code, Cursor, ChatGPT) and a "Then try asking" list of example prompts. The Connected apps page, which the dialog's "Manage connected apps" button opens, shows a different, older layout: a stacked list of every snippet under "Connect an AI client" with a separate MCP URL block, and no example prompts. The two places explain the same thing in two ways.

## Change

- `apps/web/src/features/connected-apps/use-with-ai-content.tsx`: `UseWithAiContent({ title, canEdit })`, the tabs with one `ClientSnippet` per client and the "Then try asking" section with `promptsFor`, extracted from the dialog. The dialog renders it unchanged.
- `connected-apps-page.tsx`: the section under the list renders the dialog's description (`USE_WITH_AI_DESCRIPTION`) under the `CONNECT_HEADING` heading and `UseWithAiContent` with `title: null` and `canEdit: false`, so the page shows the library prompts. `ConnectSnippets` and the separate MCP URL block are removed; the ChatGPT tab already shows the URL with its instruction.
- `connected-apps-copy.ts`: `CONNECT_DESCRIPTION` and `MCP_URL_LABEL` are removed when nothing else uses them; `connect-snippets.tsx` keeps `ClientSnippet` only.

## Tests

- Unit `use-with-ai-content.test.tsx` (red first): tabs show one client at a time; `title: null` shows the library prompts; a title with `canEdit` shows the three document prompts.
- Unit `connected-apps-page.test.tsx`: the page shows the tabs and the library prompts; the ChatGPT instruction is visible after selecting the ChatGPT tab; the old stacked snippets and the MCP URL block are gone.
- Unit `use-with-ai-dialog.test.tsx`: unchanged and green.
- E2E: every spec that reads the MCP URL or the snippets from the page (`e2e/agent.ts`, `e2e/agent.spec.ts`, `e2e/auth.spec.ts`) keeps passing, adapted to the tab if it read the stacked block.
