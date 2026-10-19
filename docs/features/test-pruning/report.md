# Test pruning: report

Spec: [spec.md](spec.md). Categories: 1 restated literal, 2 the compiler already guarantees it, 3 mock echo, 4 static markup pin, 5 duplicate layer.

## Counts

Taken from the `vitest run` summary line, one package at a time, before the first deletion and after the last.

| Package | Test files before | Test files after | Tests before | Tests after | Deleted |
|---|---|---|---|---|---|
| libs/types | 10 | 9 | 72 | 64 | 8 |
| apps/server | 92 (2 skipped) | 92 (2 skipped) | 1009 (2 skipped) | 1006 (2 skipped) | 3 |
| apps/web | 126 | 121 | 1041 | 993 | 48 |
| e2e | not run | not run | not counted | not counted | 0 |

Deleted per category: 1 restated literal 35, 2 compiler 3, 3 mock echo 5, 4 static markup 11, 5 duplicate layer 5. Total 59.

`pnpm typecheck` (libs, apps and e2e) is clean at the last commit.

## Deleted tests

`path::name | category | what still covers the behaviour, or "no behaviour"`

### libs/types

- libs/types/src/connection.test.ts::the connection states are the five values the banner names | 1 | no behaviour (file removed)
- libs/types/src/constants.test.ts::a week is seven days of milliseconds | 1 | no behaviour
- libs/types/src/constants.test.ts::the waiting page, jump glow and jump notice durations are in milliseconds | 1 | no behaviour
- libs/types/src/invites.test.ts::the invite lifetime is seven days | 1 | no behaviour
- libs/types/src/timeline.test.ts::every page search parameter is also a timeline query parameter | 2 | the compiler (pnpm typecheck)
- libs/types/src/timeline.test.ts::the time zone query parameter is named timeZone | 1 | no behaviour
- libs/types/src/timeline.test.ts::a timeline bin carries its own end | 2 | the compiler (pnpm typecheck)
- libs/types/src/timeline.test.ts::SummarizeStep lists idle, grouping and summarizing | 1 | no behaviour

### apps/server

- apps/server/src/admin/promote.test.ts::the build emits the promote entry | 1 | no behaviour (the compiled bundle is built by the gate)
- apps/server/src/insights/selection-summaries-service.test.ts::uses SUMMARIZE_COOLDOWN_MS (30000) | 1 | apps/server/src/insights/insights-routes.test.ts cooldown tests (second POST inside the cooldown answers 429, one millisecond before the end)
- apps/server/src/agent/agent-document-tools.test.ts::inspect_document dispatches superdoc_inspect on the session of the person | 3 | apps/server/src/agent/agent-sessions-room.test.ts dispatches superdoc_inspect on a real session; agent-tools.test.ts covers scope and role

### apps/web

- apps/web/src/styles/globals.test.ts::--paper is oklch(1 0 0) in :root and .dark | 1 | no behaviour
- apps/web/src/styles/globals.test.ts::dark --primary is oklch(0.55 0.2 263) | 1 | no behaviour
- apps/web/src/styles/globals.test.ts::--author-1 to --author-6 are the six hex values in :root only | 1 | no behaviour
- apps/web/src/styles/globals.test.ts::--topic-tint-lightness is 94% in light and 22% in dark | 1 | no behaviour
- apps/web/src/styles/globals.test.ts::Tailwind gets bg-paper and bg-author-1 to bg-author-6 colours | 1 | no behaviour
- apps/web/src/styles/globals.test.ts::.topic-tint paints the topic hue at the tint lightness | 1 | no behaviour
- apps/web/src/styles/globals.test.ts::SuperDoc chrome variables point at our tokens on html:root, which beats the SuperDoc :root rule | 1 | the kept test 'no SuperDoc variable stays on the plain :root rule' and the kept SuperDoc stylesheet relation
- apps/web/src/styles/globals.test.ts::--paper-foreground is oklch(0.145 0 0) in :root and .dark | 1 | no behaviour
- apps/web/src/styles/globals.test.ts::--active is oklch(0.86 0 0) in light and oklch(0.37 0 0) in dark | 1 | the kept AA and distinguishability contrast tests, now reading --active from the stylesheet
- apps/web/src/styles/globals.test.ts::--shadow-popover is defined in :root and softer in .dark | 1 | no behaviour
- apps/web/src/styles/globals.test.ts::Tailwind gets bg-active and text-paper-foreground colours | 1 | no behaviour
- apps/web/src/styles/globals.test.ts::.dark sets color-scheme dark | 1 | no behaviour
- apps/web/src/styles/globals.test.ts::the caret takes the paper foreground so it reads on the white paper in both themes | 1 | no behaviour
- apps/web/src/features/editor/download-format.test.ts::DownloadFormat lists Docx and Pdf | 1 | no behaviour (file removed)
- apps/web/src/features/editor/editor-copy.test.ts::pin: goToCursorLabel names the member with a typographic apostrophe | 1 | members.test.tsx asserts the rendered Go to Bruno’s cursor description (file removed)
- apps/web/src/features/editor/editor-copy.test.ts::pin: each download format has its menu label | 1 | download-menu.test.tsx clicks both labelled items (file removed)
- apps/web/src/features/editor/superdoc-zoom.test.ts::zoom is fit-width with max 100 at every width | 1 | superdoc-options.test.ts options test asserts the zoom; mutation 3 (file removed)
- apps/web/src/features/editor/superdoc-zoom.test.ts::the page column is centred in the editor container without clipping on narrow ones | 4 | no behaviour (a Tailwind class; file removed)
- apps/web/src/main.test.ts::the application mounts the router through the dom entry so navigations can flush synchronously | 1 | no behaviour (reads main.tsx and asserts an import line in it; file removed)
- apps/web/src/components/brand-link.test.tsx::links to documents, named "SuperDoc Collab, back to documents", with no arrow | 4 | editor-header.test.tsx::the brand link opens the documents list; mutation 1 (file removed)
- apps/web/src/components/brand-link.test.tsx::draws a primary mark with a file icon and the app name hidden below sm | 4 | no behaviour (file removed)
- apps/web/src/lib/breakpoints.test.ts::the large breakpoint is Tailwind lg and the wide one is 2xl | 1 | breakpoints.test.ts::minWidthQuery builds the query for 1536 and use-is-phone-layout.test.ts
- apps/web/src/components/error-message.test.tsx::an inset error message is still one alert with its text | 4 | error-message.test.tsx::an error message is announced as an alert
- apps/web/src/components/user-avatar.test.tsx::the sizes are 24 and 32 pixels | 1 | no behaviour
- apps/web/src/components/app-top-bar.test.tsx::without a left slot only the brand link and the right slot render | 4 | app-top-bar.test.tsx::renders the brand link and the right slot
- apps/web/src/features/editor/editor-api.test.ts::the open request targets the document path | 3 | document-page.test.tsx drives openDocument against the mocked API by path
- apps/web/src/features/editor/find-button.test.tsx::click emits search:open on the editor instance | 3 | no behaviour (a mock called with the string the code passes)
- apps/web/src/features/connected-apps/use-with-ai-content.test.tsx::the tab list has an accessible name | 1 | no behaviour
- apps/web/src/features/connected-apps/use-with-ai-dialog.test.tsx::an editor sees the fix prompt as the third one | 5 | use-with-ai-content.test.tsx::an editor sees three document prompts; mutation 5
- apps/web/src/features/connected-apps/use-with-ai-dialog.test.tsx::without a title the dialog shows the library prompts | 5 | use-with-ai-content.test.tsx::without a title the library prompts show; mutation 4
- apps/web/src/features/connected-apps/connected-apps-page.test.tsx::the ChatGPT instruction is visible after selecting the ChatGPT tab | 5 | use-with-ai-content.test.tsx::tabs show one client at a time; mutation 6
- apps/web/src/features/connected-apps/connected-apps-page.test.tsx::the stacked snippets are gone | 4 | no behaviour (a negative pin on a layout that no longer exists)
- apps/web/src/features/sharing/share-landing-page.test.tsx::the opening state is centred like the failure state | 4 | share-landing-page.test.tsx::while the accept is in flight the page says it is opening
- apps/web/src/features/editor/superdoc-options.test.ts::ui.toolbar excludes accept, reject, ruler, ... and ai | 1 | no behaviour
- apps/web/src/features/editor/superdoc-options.test.ts::excludeItems is declared satisfies readonly ToolbarItemId[] | 2 | the compiler (pnpm typecheck)
- apps/web/src/features/editor/superdoc-options.test.ts::ui.search is true so Cmd+F opens the Find bar | 1 | superdoc-options.test.ts options test asserts search: true
- apps/web/src/features/editor/superdoc-editor.test.tsx::the page background class is bg-paper and not bg-background | 4 | no behaviour
- apps/web/src/features/editor/superdoc-editor.test.tsx::hands the toolbar container to SuperDoc | 3 | superdoc-options.test.ts options test asserts the toolbar container
- apps/web/src/features/editor/editor-toolbar-row.test.tsx::the row clips horizontal overflow so a toolbar that is still laying out never scrolls the page | 4 | no behaviour
- apps/web/src/features/editor/waiting-for-document.test.tsx::the page skeleton paints with the paper token, never a literal white | 4 | no behaviour
- apps/web/src/features/editor/editor-header.test.tsx::EditorHeader passes superdoc and isPastVersion to Members | 3 | members.test.tsx drives Members with real props
- apps/web/src/features/editor/editor-header.test.tsx::the bar actions that fold below 1024 are also hidden by CSS, so a resize never shows them for a frame | 4 | editor-header.test.tsx::at 768 the bar keeps Members, Share, More actions and the account (behaviour at the narrow width)
- apps/web/src/features/editor/editor-header.test.tsx::the main download part asks for the live DOCX export | 5 | download-menu.test.tsx::the main part downloads DOCX and the chevron offers Download PDF; mutation 2
- apps/web/src/features/editor/document-page.test.tsx::the page fits the width at every width, capped at full size | 5 | superdoc-options.test.ts options test; mutation 3
- apps/web/src/features/editor/share-dialog.test.tsx::the dialog says resetting stops the old link | 1 | no behaviour
- apps/web/src/lib/index-html.test.ts::theme-color is declared for light and dark | 1 | no behaviour
- apps/web/src/lib/index-html.test.ts::the icons and the manifest are linked | 1 | index-html.test.ts::every public asset exists and index.html or the manifest names it
- apps/web/src/lib/index-html.test.ts::robots.txt allows the public pages and disallows the private ones | 1 | no behaviour

### e2e

No test deleted. No E2E repeats the steps and assertions of another E2E among the files in scope.

Notes on partial edits that delete no test: `globals.test.ts` keeps six tests and the contrast tests now read their colours from `globals.css` instead of a copy of them; `libs/types/src/timeline.test.ts` keeps the one-sentence check of the busy message and drops the cooldown literal from it; `user-avatar.test.tsx`, `editor-toolbar-row.test.tsx` and `dropdown-menu.test.tsx` lose class, size and `typeof` assertions inside tests that stay.

## Mutation checks (category 5)

Product code broken, the survivor run alone, product file restored with `git checkout -- <file>`.

1. `components/brand-link.tsx` link target changed to the About route: `editor-header.test.tsx::the brand link opens the documents list` went red (1 failed, 17 passed). Covers the deleted brand-link tests.
2. `features/editor/download-menu.tsx` main DOCX button click handler emptied: `download-menu.test.tsx::the main part downloads DOCX and the chevron offers Download PDF` and `::the main part hands the DOCX to the page and does not export a PDF` went red. Covers the deleted editor-header download test.
3. `features/editor/superdoc-zoom.ts` full zoom changed from 100 to 90: `superdoc-options.test.ts::the options open the file in its room as the signed-in user, fitted to the width` went red. Covers the deleted document-page zoom test and the deleted zoom constant test.
4. `features/connected-apps/use-with-ai-content.tsx` library prompts replaced by an empty list when there is no title: `use-with-ai-content.test.tsx::without a title the library prompts show` went red. Covers the deleted dialog test.
5. `use-with-ai-content.tsx` forced `canEdit: false`: `use-with-ai-content.test.tsx::an editor sees three document prompts` went red. Covers the deleted dialog fix-prompt test.
6. `features/connected-apps/connect-snippets.tsx` ChatGPT instruction removed: `use-with-ai-content.test.tsx::tabs show one client at a time` went red. Covers the deleted connected-apps-page ChatGPT test.

## Kept but questionable

- `apps/web/src/styles/globals.test.ts::no SuperDoc variable stays on the plain :root rule`: it uses the list of mapped variables, which is a copy, but the property (a rule that would lose the cascade to SuperDoc) is real.
- `apps/web/src/features/editor/superdoc-options.test.ts::the options open the file in its room...`: a whole-object equality that restates much of `superdocOptions`, kept because it is the only test of the wiring of file, document id, user and room mode into the options.
- `apps/web/src/components/ui/{tabs,toggle-group,tooltip,dropdown-menu,form}.test.tsx`: exercise third-party primitives through our wrappers (keyboard and ARIA behaviour). No category matches, but the value is low.
- `apps/web/src/features/editor/use-editor-setup.test.ts::pin: the setup captures the colour slot of the open answer`: a pass-through of one field.
- `apps/web/src/features/{admin,connected-apps,settings}/*-page.test.tsx` header tests (no Back link, no Sign out button, account menu present): markup pins that also guard the only way to sign out.
- `apps/web/src/features/versions/time-travel.test.tsx::below lg the version bar sits before the layout ... with a 44 px button` and the `from lg` twin: assert a `data-size` prop and DOM order, which is close to a markup pin but encodes a touch-target rule.
- `apps/web/src/lib/index-html.test.ts` Open Graph and JSON-LD tests: assert literals that live in `index.html`, mixed with constants from the copy files, so a relation stays.
- `apps/server/src/insights/prompts.test.ts` and `topics-service.test.ts` prompt-rule tests: assert that a composed prompt contains a constant defined beside it; they catch a rule dropped from the prompt template.
- `apps/server/src/agent/agent-authorization.test.ts::the unauthorized response points clients at the protected resource metadata`: the header format is an external protocol contract.
- `libs/types/src/routes.test.ts::invite and admin paths encode their parameters`: the two admin path lines are literal restatements next to a real encoding check.

## Skipped for ownership

Not read and not touched, because another lane edits them. A second pass should cover them.

- apps/web/src/features/documents/**
- apps/web/src/features/auth/**
- apps/web/src/components/history-illustration*
- apps/web/src/features/editor/document-title.test.tsx
- libs/history/**
- apps/server/src/history/**
- apps/web/src/features/versions/version-*.test.tsx
- apps/web/src/features/timeline/**
- apps/server/src/repository-shape/**
- scripts/verify.test.sh
- e2e/documents.spec.ts, e2e/auth.spec.ts, e2e/time-travel.spec.ts, e2e/final-visuals.spec.ts

`scripts/` holds no other test file in scope. Test files under `apps/server/src` that were skimmed by test name and not read line by line: the large collaboration, insights and documents suites. They are behaviour tests that drive the server, and none matched a category by name.
