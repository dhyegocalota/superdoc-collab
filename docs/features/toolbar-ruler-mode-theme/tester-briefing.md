# Tester briefing: Toolbar: ruler, document mode and theme

## What changed

- `apps/web/src/features/editor/superdoc-options.ts`: `ruler` and `document-mode` leave `TOOLBAR_EXCLUDED_ITEMS`; `measurement-unit` stays.
- `apps/web/src/features/editor/editor-theme.ts`, `use-editor-theme.ts`: preset enum, stored-value parsing, SuperDoc `createTheme` config, hook (apply, store, cross-tab, same-tab).
- `apps/web/src/features/editor/theme-button.tsx`, `editor-toolbar-row.tsx`, `editor-copy.ts`: the Theme popover beside Summarize.
- `apps/web/src/styles/globals.css`: `--sd-ui-action*` fall back to `--sd-editor-accent*`, then to `--primary`.
- `e2e/toolbar-ruler-mode-theme.spec.ts`: one spec. Written, typechecked, never run: ports 3100 and 3199 were held by another session's stack. Selectors for the ruler host (`.v2-ruler-host *`) and the mode dropdown (`[data-item^='btn-documentMode']`) come from reading SuperDoc's bundle, not from a browser; correct them first if the spec fails there.
- Sibling file touched: none. New shared file: `apps/web/src/components/ui/popover.tsx` (shadcn-style wrapper over `radix-ui` Popover, additive).

## Preset colours (light, dark)

Ocean `#0369a1`, `#38bdf8`; Forest `#15803d`, `#4ade80`; Sunset `#c2410c`, `#fb923c`; Mono `#3f3f46`, `#e4e4e7`. A custom accent is the same in both.

## Run

- `pnpm --filter @superdoc-collab/web exec vitest run src/features/editor/superdoc-options.test.ts` (and `editor-theme.test.ts`, `use-editor-theme.test.tsx`, `editor-toolbar-row.test.tsx`)
- `pnpm exec playwright test e2e/toolbar-ruler-mode-theme.spec.ts --project=chromium`

## Red first

| Commit | Test | Red failure text |
|---|---|---|
| 8610fa11 | `superdoc-options.test.ts::the toolbar keeps the ruler and the document mode…` | `AssertionError: expected [ …(10) ] to not include 'ruler'` |
| 24e81296 | `editor-theme.test.ts` (9 tests, with a throwing stub) | `Error: parseEditorThemeChoice is not implemented` (and the three other stubbed functions) |
| ed0a63f6 | `use-editor-theme.test.tsx` (9 tests, stub) | `Error: useEditorTheme is not implemented` |
| e8e0fdfc | `editor-toolbar-row.test.tsx::the Theme button opens…` | `TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "Theme"` |

The Reader assertion added to `the row is absent for a reader` is a pin (green when it landed). `pickerColorOf` has no test of its own; the row test reads it through the colour input value.

## Hypotheses for the tester

- The mode dropdown follows `⌘⌥T` and `setMode` in both directions. Not verified in a browser: SuperDoc's toolbar reads the `document-mode` command from its controller snapshot, which should follow the host's `document-mode-change`. If the label lags, the smallest fix is in `use-shortcuts.ts` (route through `superdoc.setDocumentMode`).
- The ruler button toggles `.v2-ruler-host` content and is off after a reload.
- Default is pixel-identical to main: with no stored value no class is on `html` and `--sd-ui-action` resolves to `--primary`.
- `light-dark()` inside a custom property resolves per the `color-scheme` of the element that uses it (`.dark` sets `color-scheme: dark`); confirm Ocean reads `#38bdf8` in dark.
- A stored `sepia` is removed and Default applies; a stored `#336699` applies as a custom accent.
- The popover opens over the toolbar's `overflow-x-clip` row (it is portaled) and the Theme button stays reachable at 375 px.
- Dropdown options hidden for Viewers are not in play: Owner and Editor see all three.

## Gaps

- Nothing here ran in a browser. Reader on a read-only link keeps no toolbar row, so the theme class is never applied for a Reader even with a stored preset (by design).
- Two tabs of the same browser both mount the hook only on the document page; the `storage` event keeps them in step.
