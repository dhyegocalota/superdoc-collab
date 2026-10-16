# 0009. Design system: Tailwind with shadcn/ui, visually coherent with SuperDoc

- Status: Accepted
- Date: 2026-10-16
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: the brief's mock (`docs/brief/`), [0004](0004-stack.md), [0008](0008-vertical-slices.md)

## Context

The SuperDoc editor occupies roughly half of the main screen and cannot be re-themed from the inside. The take-home is judged on a user-centric, unrushed UX. The owner makes design-system decisions explicitly; nothing visual is chosen silently.

## Decision

Two layers, decided separately:

1. **Styling and components:** Tailwind CSS with shadcn/ui. Components are copied into `apps/web/src/components/ui/` (Radix primitives underneath), so the code is ours, accessible by default and free of runtime dependencies on a component library. Theme through CSS variables (tokens) consumed by Tailwind.
2. **Visual direction:** coherent with SuperDoc. Light neutrals, one blue accent close to the editor's, Inter or the system font stack, light mode by default with an optional dark mode driven by the same tokens. The application must read as an extension of the editor, not as a dashboard glued next to it, which is what the brief's mock shows.

The chart palette (bands by topic, author colours for avatars) is decided in the `timeline-and-time-travel` slice and recorded there.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Tailwind + Radix primitives with hand-made components | Stronger own identity | Every control designed from scratch; time taken from the timeline | Time is better spent on the visualization |
| CSS Modules + Radix, no Tailwind | Shows CSS command; no long class lists | Slower iteration; no ready component ecosystem | Iteration speed matters more here |
| Full library (Mantine, MUI) | Data table and pickers ready | Heavy; hard to match the editor's look; weak UX story | Visual coherence with the editor would suffer |
| Data-viz-first dark theme | Striking demo | The light editor becomes a white rectangle in a dark page | Coherence loses |
| Distinct own identity (serif titles, amber accent) | Shows design decisions | Competes with the editor; fine-tuning cost | Same |

## Consequences

- `apps/web` ships `tailwind.config`, `globals.css` with the token set, and the shadcn/ui components it actually uses; unused components are not added.
- Tokens live in one place; dark mode is a token switch, never per-component colours.
- Screenshots in pull requests are taken in light mode unless the slice is about dark mode.

## Evidence

Owner decisions on 2026-10-16 (two questions, both answered with the recommended option).

## Revisit when

The timeline slice needs a visual treatment the token set cannot express, or the editor's own theme changes in a SuperDoc upgrade.
