# Tester briefing: Final visuals

Written by the developer sub-agents when their steps are done. A developer does not run `test-plan.md` and does not declare the feature works. Each group appends its own section.

## G1 foundations (developer-1, branch `feat/final-visuals-g1`)

### What changed

- `libs/types/src/author-colors.ts`: `authorColorKeyOf`, `authorColorSlot` (FNV-1a over UTF-8 bytes), `AuthorColorSlot` (1 to 6), `AUTHOR_COLOR_SLOT_COUNT`, `AGENT_KEY_SUFFIX`, `IMPORTED_KEY_PREFIX`, `HASH_OFFSET_BASIS`, `HASH_PRIME`. It takes `Pick<EventAuthor, 'id' | 'name'>`, so any `EventAuthor` is accepted as is. An agent's `id` with the `#agent` suffix loses it; `id: null` becomes `imported:` plus the trimmed lowercase name.
- `libs/types/src/constants.ts`: `DOCUMENT_READY_POLL_MS`, `DOCUMENT_READY_GIVE_UP_MS`, `CURSOR_GLOW_MS`, `JUMP_FAILED_NOTICE_MS`.
- `libs/types/src/timeline.ts`: `SummarizeStep`, `SUMMARIZE_COOLDOWN_MS`, `SUMMARIZE_BUSY_MESSAGE`, and a required `step: SummarizeStep` on `SelectionSummaryView`. `SELECTION_SUMMARY_COOLDOWN_MS` and `TOPICS_REFRESH_TOO_SOON_MESSAGE` are still there for G4 to remove.
- `apps/web/src/lib/breakpoints.ts`, `use-theme.ts` (`useTheme`, `ThemePreference`, `THEME_STORAGE_KEY`, `isThemePreference`).
- `apps/web/index.html`: inline script that adds `dark` before the bundle.
- `apps/web/src/styles/globals.css`: `--paper`, `--topic-tint-lightness`, `--author-1` to `--author-6`, dark `--primary` at `oklch(0.55 0.2 263)`, `bg-paper` and `bg-author-N` in `@theme inline`, `.topic-tint`, the `--sd-ui-*` and `--sd-layout-page-bg` mapping.
- `apps/web/src/components/ui/`: `toggle-group.tsx`, `tooltip.tsx`, `tabs.tsx`, and `dropdown-menu.tsx` with `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuRadioGroup`, `DropdownMenuRadioItem`.
- `apps/web/src/components/`: `user-avatar.tsx` (`UserAvatar`, `UserAvatarSize` 24 and 32), `brand-link.tsx`, `app-top-bar.tsx`.
- `apps/web/src/features/account/`: `account-menu.tsx`, `account-copy.ts`.
- `apps/web/src/features/auth/sign-out-button.tsx`: now a `DropdownMenuItem`.

### How to run

```bash
pnpm install --frozen-lockfile
pnpm --filter @superdoc-collab/types test:unit
pnpm --filter @superdoc-collab/web test:unit src/lib src/styles src/components src/features/account src/features/auth/sign-out-button.test.tsx
```

### Red today, green after

Failure texts are what the red run printed at the red commit. A row marked "changed" had its test corrected in the green commit because the first version was wrong, not the code.

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `libs/types/src/author-colors.test.ts::authorColorKeyOf joins an agent to its person and imports by trimmed lowercase name` (c4d18f5) | `Error: authorColorKeyOf is not implemented for Ana` | key rule implemented (4657002) |
| `…::authorColorSlot returns 1 to 6 and the same value on repeat`, `…spreads many keys over all six slots`, `…follows the 32-bit FNV-1a of the key` (c4d18f5) | `Error: authorColorSlot is not implemented for u1` | FNV-1a, 32-bit, modulo 6 plus 1 |
| `libs/types/src/constants.test.ts::the waiting page, jump glow and jump notice durations are in milliseconds` (443e217) | `AssertionError: expected [ undefined, undefined, …(2) ] to deeply equal [ 2000, 300000, 1200, 3000 ]` | constants added |
| `libs/types/src/timeline.test.ts::SummarizeStep lists idle, grouping and summarizing` (858a5a4) | `TypeError: Cannot convert undefined or null to object` | enum added |
| `…::the summarize cooldown is thirty seconds and the busy message is one sentence` (858a5a4) | `AssertionError: expected undefined to be 30000` | constants added |
| `apps/web/src/lib/breakpoints.test.ts::minWidthQuery builds the query for 1536` (ee52870) | `Error: minWidthQuery is not implemented` | query built |
| `apps/web/src/lib/use-theme.test.tsx::useTheme adds dark to html for Dark and stores the choice` and six siblings (cb2a64d) | `Error: useTheme is not implemented` | hook implemented |
| `apps/web/src/lib/theme-script.test.ts::index.html sets dark before the bundle and reads THEME_STORAGE_KEY` (ca9cfd7, dbb07df) | `AssertionError: expected false to be true` and `Error: index.html has no inline script` for the rows that run the script. The first version failed with `The URL must be of scheme file` and the css-as-raw version with an empty string, both test bugs, fixed in ed2c7f4 and dbb07df | inline script in `index.html` |
| `apps/web/src/styles/globals.test.ts` seven tests (6ad114e, ed2c7f4) | `AssertionError: expected null to be 'oklch(1 0 0)'`, `expected 'oklch(0.62 0.2 263)' to be 'oklch(0.55 0.2 263)'`, `expected [ null, null, null, null, null, null ] to deeply equal [ '#2e39b8', … ]`, `globals.css has no .topic-tint block` | tokens added |
| `components/ui/toggle-group.test.tsx::arrow keys move selection between two items` (965d21d) | `Failed to resolve import "./toggle-group"` | primitive added. Changed: I dropped a "one item has tabindex 0" test, because Radix makes the group the tab stop |
| `…/tooltip.test.tsx::opens on keyboard focus` (8d079a5) | `Failed to resolve import "./tooltip"` | primitive added |
| `…/tabs.test.tsx::selects one tab panel at a time` (97bc66f) | `Failed to resolve import "./tabs"` | primitive added |
| `…/dropdown-menu.test.tsx::exports a label, a separator and a radio group with radio items` (96850e0) | `AssertionError: expected [ 'undefined', 'undefined', …(2) ] to deeply equal [ 'function', … ]` | parts added. Changed: the test uses a controlled group, because Radix has no `defaultValue` on the dropdown radio group |
| `components/user-avatar.test.tsx::renders initials on the author colour at 24 and 32 px` (edcf31e) | `Failed to resolve import "./user-avatar"` | component added |
| `components/brand-link.test.tsx::links to documents, named "SuperDoc Collab, back to documents", with no arrow` and `components/app-top-bar.test.tsx::renders the brand link and the right slot in a 52 px bar` (fa828f4) | `Failed to resolve import "./brand-link"` and `"./app-top-bar"` | components added. Changed: brand link test reads `document.body`, since `renderWithProviders` returns no container |
| `features/account/account-menu.test.tsx` six tests (4984f86) | `Failed to resolve import "./account-menu"` | menu added |
| `features/auth/sign-out-button.test.tsx::renders as a menu item and still signs out` (58c27ba) | `TestingLibraryElementError: Unable to find role="menuitem" and name "Sign out"` | item added |

### Hypotheses to attack

1. Hypothesis: the same user id gives the same colour slot on every client, and an agent shares its person's slot. Break it by: compare `authorColorSlot(authorColorKeyOf(...))` for `u1`, `u1#agent` and an imported name with odd casing or spaces, and non-ASCII names.
2. Hypothesis: the page is never light for a dark reader on reload. Break it by: set `superdoc-collab.theme` to `dark`, `system` with a dark OS, an unknown value, and block storage; reload each time and watch the first paint.
3. Hypothesis: a theme change in one tab reaches the other tab and the version iframe. Break it by: open two tabs, choose Dark in one, look at the other without reloading.
4. Hypothesis: the account menu stays open after a theme choice and closes after a link or Sign out. Break it by: keyboard only (Enter, Space, arrows, Escape) and then at 375 px.
5. Hypothesis: the primary Summarize/Share buttons in dark mode reach AA. Break it by: measure white on dark `--primary` and the `--author-N` backgrounds.
6. Hypothesis: with `step` required on `SelectionSummaryView`, nothing in G1 compiles wrong. Break it by: `pnpm typecheck` and read the errors (they belong to G4, listed below).

### Known gaps

- `pnpm typecheck` is red in files G1 does not own, because `SelectionSummaryView.step` is required. G4 must add `step` to the producer `apps/server/src/insights/selection-summaries-service.ts` (line 185) and to these web fixtures: `features/editor/document-page.test.tsx`, `features/timeline/selection-summary-card.test.tsx`, `selection-summary.test.ts`, `timeline-api.test.ts`, `timeline-panel.test.tsx`, `use-selection-summary.test.ts`, `features/versions/time-travel.test.tsx`.
- `SignOutButton` is now a menu item and throws `MenuItem must be used within Menu` outside a menu. Thirty-one tests fail until G7 swaps the standalone header buttons for `AccountMenu`: `features/admin/admin-page.test.tsx`, `features/documents/documents-page.test.tsx`, `features/settings/settings-page.test.tsx` and `features/auth/sign-out-flow.test.tsx` (it clicks a `button` named Sign out; after the swap it opens the account menu first).
- `apps/web/src/lib/copy-rules.test.ts` does not scan `account-copy.ts`; its owner can add it.
- The account trigger has `aria-label` but no `Tooltip` yet (design section 2 lists one); the Tooltip primitive is ready for whoever wires the top bars.
- `home-link.tsx` is untouched; G8 deletes it. `BrandLink` imports `HOME_LINK_LABEL` from `features/editor/editor-copy.ts`.
- Nothing here was seen in a browser. Real Radix pointer, focus and animation behaviour, the contrast numbers and the first-paint theme are untested beyond jsdom.
