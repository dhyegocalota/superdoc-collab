# Dark theme: every SuperDoc surface follows the tokens

**Status:** Shipped 2026-10-18
**Tier:** 🟡
**Owner approval:** approved 2026-10-18 ("fix tambem o theme dark porque tem varias falhas (ex: cursor no doc nao da pra ver, dropdown da toolbar do doc onde tem font entre outros nao da pra ver, que mais???)")
**ADRs:** [0009](../../adr/0009-design-system.md) (dark mode is a token switch, never per-component colours)
**Not changing:** the paper stays white in both themes (final-visuals spec); the six author colours; the light theme's token values; SuperDoc itself; the PDF text layer's `color-scheme: only light`.

## Problem

Dark mode is one `.dark` class on `<html>` and our own surfaces use tokens, but SuperDoc's stylesheet hard-codes light colours for the chrome we never mapped: the active toolbar button and the active option of the font-family dropdown (`--sd-ui-active-bg: #c8d0d8` under light `--sd-ui-text`), the menu header (`#fafafa`), the muted menu text (`#888`), dropdown and menu backgrounds, borders and black shadows, tooltips, the find bar, the disabled text. The caret has no `caret-color`, so it inherits the light body text colour and vanishes on the white paper. The waiting page's skeleton uses a literal `bg-white`. The app sets no `color-scheme`, so native scrollbars and selects stay light. A live audit (`design.md`, when the designer delivers it) may add more surfaces; they take the same rule.

## Goals

- Every `--sd-ui-*` variable whose SuperDoc default is a literal colour is mapped to one of our tokens on `html:root`, so both themes follow the tokens; the dark-only overrides stay in `html:root.dark` as today.
- The caret is visible on the paper in both themes.
- Native controls and scrollbars follow the theme (`color-scheme`).
- No literal colour class on our own surfaces (`bg-white` → `bg-paper`).

## Design

### Data flow

1. `apps/web/src/styles/globals.css`:
   - new tokens in `:root` and `.dark`: `--paper-foreground: oklch(0.145 0 0)` (both themes, text on the white paper) and `--active` (light `oklch(0.86 0 0)`, dark `oklch(0.37 0 0)`), exposed to Tailwind as `--color-paper-foreground` and `--color-active`;
   - `html:root` maps, in addition to today's: `--sd-ui-active-bg`, `--sd-ui-dropdown-active-bg`, `--sd-ui-menu-item-active-bg`, `--sd-ui-toolbar-button-active-bg` → `var(--active)`; `--sd-ui-dropdown-hover-bg`, `--sd-ui-menu-item-hover-bg`, `--sd-ui-toolbar-button-hover-bg`, `--sd-ui-comments-option-hover-bg` → `var(--accent)`; `--sd-ui-dropdown-bg`, `--sd-ui-menu-bg`, `--sd-ui-surface-bg`, `--sd-ui-tooltip-bg`, `--sd-ui-tools-item-bg` → `var(--popover)`; `--sd-ui-dropdown-border`, `--sd-ui-menu-border`, `--sd-ui-comments-separator`, `--sd-ui-comments-input-border` → `var(--border)`; `--sd-ui-menu-header-bg` → `var(--muted)`; `--sd-ui-menu-text-muted`, `--sd-ui-text-disabled`, `--sd-ui-comments-timestamp-text` → `var(--muted-foreground)`; `--sd-ui-toolbar-button-text` → `var(--foreground)`; `--sd-ui-tooltip-text` → `var(--popover-foreground)`; `--sd-ui-action-text` → `var(--primary-foreground)`; `--sd-ui-comments-input-bg` → `var(--card)`; any further `--sd-ui-*` literal the developer finds in `superdoc/dist/style.css` follows the same table (shadows: a token `--shadow-popover` in both themes, dark one lighter and softer, mapped to every `--sd-ui-*-shadow`; the dialog backdrop and the search-match highlights stay SuperDoc's, they read on both themes);
   - `.dark { color-scheme: dark; }`;
   - the caret: SuperDoc paints it as an overlay `div` with `background: currentColor`, so a rule on `[data-v2-local-selection-caret='true']` sets `color: var(--paper-foreground)`; `caret-color` does nothing there;
2. `apps/web/src/styles/globals.test.ts`: the `SUPERDOC_VARIABLES` map grows with every new mapping; a test pins `color-scheme: dark` in `.dark`, `--paper-foreground` in both blocks, `--active` in both, and the caret rule.
3. `apps/web/src/features/editor/waiting-for-document.tsx`: `bg-white` → `bg-paper`.
4. The extra surfaces came from the reviewer's pass (the comment tag and disabled backgrounds) and are mapped with the same rules. The tester's dark walk is the live audit of record; a defect it finds returns to Build with the same rules.

### Failure handling

- A SuperDoc variable that does not exist in 2.23.0 is harmless but must not be in the map: the developer greps each name in the dist before mapping it.
- Contrast: every mapped text/background pair meets WCAG AA on both themes; the test computes the ratio for the active item (`--foreground` on `--active`) in both themes the way the existing tracked-change test does.

## Test strategy summary

- Unit (red first): `globals.test.ts` for the new map, the tokens, `color-scheme` and the caret rule, plus the active-item contrast, the active-versus-background contrast and a check that every mapped name exists in the installed SuperDoc stylesheet.
- E2E `e2e/dark-theme.spec.ts` (new): with the theme set to dark through the stored preference (read `apps/web/src/lib/use-theme.ts` for the storage key), open a document: the caret overlay `[data-v2-local-selection-caret='true']` has computed `color` equal to the paper foreground; Bold's toolbar button and the font-family dropdown's selected option have a computed background equal to the resolved `--active`; the dropdown background equals `--popover` and its hovered option text equals `--foreground`; `document.documentElement` has `color-scheme: dark`.
- Walk at 1280 and 375 in dark: toolbar, every dropdown, caret and selection, find bar, share dialog, members, Edits panel, version viewer, documents list, admin, settings, connected apps, waiting page; then light to prove nothing regressed.
