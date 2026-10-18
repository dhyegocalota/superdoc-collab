# Tester briefing: dark theme (G1)

## What changed

- `apps/web/src/styles/globals.css`: new tokens `--paper-foreground` (both themes), `--active` (light `oklch(0.86 0 0)`, dark `oklch(0.37 0 0)`) and `--shadow-popover` (light `0 8px 24px oklch(0 0 0 / 0.16)`, dark `0 4px 16px oklch(0 0 0 / 0.35)`); Tailwind colours `bg-active` and `text-paper-foreground`; `.dark { color-scheme: dark }`; the caret rule; 32 new `--sd-ui-*` mappings on `html:root`.
- `apps/web/src/features/editor/waiting-for-document.tsx`: `bg-white` became `bg-paper`.
- Tests: `globals.test.ts`, `waiting-for-document.test.tsx`, `e2e/dark-theme.spec.ts` (not run by the developer).

## Caret

SuperDoc 2.23.0 paints the local caret as a 1px `div` with inline `background: currentColor`, class `sd-v2-local-selection-caret`, attribute `data-v2-local-selection-caret="true"`, inside the layout overlay. There is no contenteditable caret on the page: the hidden input is a `textarea`, so `caret-color` would change nothing. The colour therefore comes from `color`, which the overlay inherits from the light body text in dark mode.

Rule: `[data-v2-local-selection-caret='true'] { color: var(--paper-foreground); }`. The selector comes from reading the engine source (`@superdoc/docx-engine` `dist/docx-engine.es.js`), not from a browser: confirm in the DOM.

## Variable map (all on `html:root`)

| Token | SuperDoc variables |
|---|---|
| `--active` | `--sd-ui-active-bg`, `--sd-ui-dropdown-active-bg`, `--sd-ui-menu-item-active-bg`, `--sd-ui-toolbar-button-active-bg` |
| `--accent` | `--sd-ui-dropdown-hover-bg`, `--sd-ui-menu-item-hover-bg`, `--sd-ui-toolbar-button-hover-bg`, `--sd-ui-comments-option-hover-bg` |
| `--popover` | `--sd-ui-dropdown-bg`, `--sd-ui-menu-bg`, `--sd-ui-surface-bg`, `--sd-ui-tooltip-bg`, `--sd-ui-tools-item-bg` |
| `--border` | `--sd-ui-dropdown-border`, `--sd-ui-menu-border`, `--sd-ui-comments-separator`, `--sd-ui-comments-input-border` |
| `--muted` | `--sd-ui-menu-header-bg`, `--sd-ui-comments-tag-bg`, `--sd-ui-disabled-bg` |
| `--muted-foreground` | `--sd-ui-menu-text-muted`, `--sd-ui-text-disabled`, `--sd-ui-comments-timestamp-text` |
| `--foreground` | `--sd-ui-toolbar-button-text` |
| `--popover-foreground` | `--sd-ui-tooltip-text` |
| `--primary-foreground` | `--sd-ui-action-text` |
| `--card` | `--sd-ui-comments-input-bg` |
| `--shadow-popover` | `--sd-ui-dropdown-shadow`, `--sd-ui-menu-shadow`, `--sd-ui-tooltip-shadow`, `--sd-ui-surface-shadow`, `--sd-ui-comments-card-shadow`, `--sd-ui-comments-dropdown-shadow` |

Mapped beyond the spec's table: the six shadow variables above, `--sd-ui-comments-tag-bg` and `--sd-ui-disabled-bg`, found in `superdoc/dist/style.css` with literal black or grey rgba defaults. Every name was grepped in that stylesheet. Left to SuperDoc on purpose: `--sd-ui-dialog-backdrop`, the search-match backgrounds, `--sd-ui-find-replace-action-btn-color` (`#fff` on the action colour) and the `--sd-comments-highlight-*` and hover colours.

## Run in dark

Choose Dark in the account menu (Light to go back). Walk, in light and in dark, at 1280 and 375: the toolbar's active button (press Bold), the font dropdown's selected option, caret, text selection, find bar, share dialog, members, Edits panel, version viewer, documents list, admin, settings, connected apps and the waiting page. Open a document, click into the text: the caret must be dark on the white paper. Open the font-family dropdown from the toolbar: the list uses the popover colour, the hovered option the accent colour, the shadow is visible.

## Red today, green after

| Test | Red commit | Failure text printed |
|---|---|---|
| `globals.test.ts` SuperDoc chrome variables map | e74870e | `AssertionError: expected { …(47) } to deeply equal { …(47) }`, each new entry `"--sd-ui-active-bg": null` against `"var(--active)"` |
| `globals.test.ts` `--paper-foreground` | e74870e | `expected null to be 'oklch(0.145 0 0)'` |
| `globals.test.ts` `--active` | e74870e | `expected null to be 'oklch(0.92 0 0)'` |
| `globals.test.ts` `--shadow-popover` | e74870e | `expected null to be '0 8px 24px oklch(0 0 0 / 0.16)'` |
| `globals.test.ts` Tailwind colours | e74870e | `expected null to be 'var(--active)'` |
| `globals.test.ts` `color-scheme` | e74870e | `expected null to be 'dark'` |
| `globals.test.ts` caret rule | e74870e | `Error: globals.css has no [data-v2-local-selection-caret='true'] block` |
| `waiting-for-document.test.tsx` skeleton | ccefd0b | `expect(element).toHaveClass("bg-paper")`, received classes include `bg-white` |

Pin: `globals.test.ts` `--foreground on --active reaches AA in both themes` is green at its landing commit because it reads token constants only (e74870e, pin).

Green after: 75bc231 (CSS), 376db86 (waiting page). Both files run green together: 25 tests.

## Hypotheses for the tester

- In dark, the caret and the typed text cursor are dark on the white paper; remote carets are untouched.
- In dark, every toolbar dropdown, menu, tooltip and comment card reads with token colours and a visible shadow.
- In light, the active toolbar item is `oklch(0.86 0 0)` instead of `#c8d0d8` (1.53:1 against white): distinguishable from the toolbar background.
- Native scrollbars and selects are dark in dark mode.
- `e2e/dark-theme.spec.ts` passes in both tests; the dropdown selectors (`btn-fontFamily-toggle`, `dropdown-menu`, `option`) were read from the SuperDoc source, not run.

## Known gaps

- The seven `--sd-ui-menu-*` names are unconsumed in SuperDoc 2.23.0 and docx-engine 0.22.0; they stay mapped for forward compatibility. `--muted-foreground` on `--muted` is 4.34:1 in light, so if SuperDoc starts consuming the menu header, that text would sit just under AA; neither token nor pairing was changed.
- The dark shadow value is my reading of "lighter and softer"; the designer may want another.
- The E2E and the caret selector were never run in a browser by the developer.
- G2 (the designer's live audit) is not started.
