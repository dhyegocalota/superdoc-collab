# A disabled button never shows its title, so the reason must be visible text

- Date: 2026-10-17
- Inspired by: slice 4 Task 10 review (`apps/web/src/features/timeline/summarize-edits-button.tsx`): the "why is this disabled" reason lived only in `title` on a natively `disabled` button
- Revisited: 2026-10-17
- Revisited: 2026-10-17 — still true; the UX lane gave Regroup topics the same visible reason (`regroupDisabledReason` in `timeline-panel.tsx`) instead of a `title`. Promoted to `.claude/rules/web-ui.md` → Copy

## Signal
A greyed-out button with a perfectly good `title` explaining why, and nobody — mouse or keyboard — ever reads it; tests pass because they assert the attribute.

## Cause
The shared `Button` has `disabled:pointer-events-none`, so hover never fires; a natively disabled control cannot take focus, so keyboard users cannot reach the title either.

## Do
Render the reason as visible muted text next to the control and link it with `aria-describedby` (keep `title` for the hover case when pointer events are on); assert the visible text in tests, not the attribute.

## Anchor
`apps/web/src/features/timeline/summarize-edits-button.tsx`, `timeline-panel.test.tsx`
