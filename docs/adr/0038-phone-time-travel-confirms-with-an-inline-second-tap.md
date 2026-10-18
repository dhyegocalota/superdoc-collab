# 0038. Phone time travel confirms with an inline second tap and shows its loading

- Status: Accepted
- Date: 2026-10-18
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: the owner's phone walk of 2026-10-18 ("selecting on the graph and going back to an old version should be smoother: there is no confirmation and no loading state"); `docs/features/summary-mobile/design.md` sections 5 and 6.

## Context

On every width a tap on a bin that holds a version moves the editor to that version after a 300 ms debounce (`use-time-travel.ts`), with no confirmation and no visible loading: the banner says "Loading this version…" but the graph, the summary card and the editor look unchanged until the frame is ready. On a phone the panel covers half the screen, the tap and the result are far apart, and the reader cannot tell whether anything happened. On desktop the same immediacy is the scrubbing the final-visuals design wanted.

## Decision

Below the `lg` breakpoint selecting a bin, by pointer or by key, only selects it: the pinned header under the chart shows the time, the character count and a "View version" button for a versioned bin that is not already shown; pressing that button travels at once. At `lg` and up the first tap travels as today. While a version loads, on every width, a two-pixel indeterminate line sits under the version bar and the inner editor area dims to the same opacity the failed state uses, until the version frame is visible. Below `lg` only, the chart wrapper is `aria-busy`, the chart ignores pointer presses and View version is disabled during that wait. On phones the version bar and the line sit above the layout, outside the shared scroller, with "Back to live" at 44 px.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Inline second tap below `lg` (chosen) | the confirmation the owner asked for, no modal, one extra tap only for versions, desktop scrubbing untouched | one extra tap per version on a phone | — |
| A confirm dialog | explicit | two taps on every version on every width; a dialog protects a read-only, one-tap-reversible action | cost without benefit |
| No confirmation, a pinned "Back to live" and the loading state only | smallest change | the owner asked for a confirmation on the phone flow | the owner's call |
| A skeleton over the editor while loading | matches an earlier design note | hides the document the reader was on and flashes on fast loads | the dimmed editor keeps the reader's place |

## Consequences

- Phone readers press View version once per version; from `lg` arrow-key and pointer scrubbing are unchanged.
- Below `lg` the chart drops pointer presses during a load and View version is disabled, so a fast double tap cannot queue two versions.
- `prefers-reduced-motion` turns the progress pulse and the scroll animation off.

## Evidence

The design audit at 375 x 812 and 320 x 568 (`.pr-media/summary-mobile/audit/`, git-ignored) and the E2E at a phone viewport that this feature adds.

## Revisit when

The owner wants the two-step on desktop too, or a version loads under 200 ms on the production host so the loading state never shows.
