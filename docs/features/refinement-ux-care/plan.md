# Refinement: UX care Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** close every in-scope finding of the 2026-10-17 UX audit so each screen explains itself at 1280 and 375.

**Architecture:** presentation changes inside the components that own each screen, plus a thin shared layer (app name, page title hook, two shadcn primitives, three colour tokens). No API, schema or dependency change. SuperDoc's own `zoom` option drives fit-to-width.

**Tech Stack:** React 19, React Router 8, TanStack Query 5, Tailwind 4, shadcn on `radix-ui`, SuperDoc 2.23.0, Vitest + Testing Library, Playwright.

**Spec:** `docs/features/refinement-ux-care/spec.md`

**Branch:** `fix/refinement-ux-care`, cut from `main` after lane B (structure) is merged.

**Seam:** the feature components under `apps/web/src/features/*`, `apps/web/src/lib/`, `apps/web/src/components/ui/`, `apps/web/src/styles/globals.css`, the copy constants in `libs/types/src/{documents,timeline}.ts`, and three E2E helpers.

**Assumptions (decided, owner can override):**
- Lane B is merged: `apps/web/src/lib/format-date-time.ts` exports `formatTimestamp(time: number): string` and `formatBinRange({ start, binMs }: { start: number; binMs: number }): string`; the version files live in `features/versions/`; test helpers live in `apps/web/src/testing/`; `use-element-width` lives in `apps/web/src/lib/`. If lane B left a name or path different, follow lane B and keep the behaviour below.
- `apps/web/src/test-setup.ts` stays at its path.
- Every "planner default" row of the spec's decisions table holds unless the owner overrides it.

## Global Constraints

- No comments. No `else`. Flat `if`s with early returns. Never `?? default` (`?.` is fine).
- Enums over string literals; constants at the top of the file or in a `*-copy.ts` file; every new user-visible string lives in a copy file (`apps/web/src/lib/app-copy.ts`, `features/*/*-copy.ts` or `libs/types`).
- Function declarations for functions, components and hooks. Named parameters for more than one parameter.
- shadcn primitives in `apps/web/src/components/ui` only; no new fonts; no fixed container sizes; Tailwind classes match neighbouring files.
- Every disabled control explains itself with a visible reason linked by `aria-describedby`.
- Tests first: each task commits its failing tests on their own (`test(web): …`) before the implementation commit (`fix(web): …`). Each red test fails on its named assertion, not on an import error (add inert stubs when needed).
- No class-string assertions in new tests; assert roles, names, text, attributes, call arguments.
- Never `git add -A` or `git add .`; add the files named in the task. Attribution lines from the agent harness go at the end of every commit body.
- Single test: `pnpm --filter @superdoc-history/web exec vitest run <path>`. Gates: `pnpm typecheck`, `pnpm test:unit`, `pnpm test:e2e`.

## Review Focus

1. **A Dialog opened from a dropdown item leaves `pointer-events: none` on `body`** after it closes, so the page stops responding to clicks. Expected: after Cancel in the delete dialog the header buttons are clickable. Pinned in Task 8 (`body` has no `pointer-events: none` after Cancel); the menu uses `modal={false}` in Task 7.
2. **`navigator.clipboard` missing on an insecure origin throws synchronously** instead of rejecting. Expected: the same fallback as a rejection (input selected, status shown). Pinned in Task 8 with a synchronous throw.
3. **Opening a document whose summary is already cached scrolls a phone page down to the panel.** Expected: no scroll on first render, only when a new result or the running state appears. Pinned in Task 4.
4. **A band of exactly one character** reads "1 character" and the E2E `bandNamed` locator must still find it. Pinned in Task 2 (unit) and the locator change in Task 2.
5. **Crossing the `lg` breakpoint while a document is open** must switch the zoom both ways and the listener must be removed on unmount. Pinned in Task 7 (`superdoc-zoom.test.ts`).

---

## File map

| Group | Paths owned | Developer sub-agent |
|-------|-------------|---------------------|
| G0 | `apps/web/src/styles/globals.css`, `apps/web/src/test-setup.ts`, `apps/web/src/lib/app-copy.ts`, `apps/web/src/lib/use-document-title{,.test}.ts`, `apps/web/src/components/ui/{skeleton,dropdown-menu}.tsx`, `apps/web/src/testing/render-with-providers.tsx` | `developer-ux-foundations` |
| G1 | `apps/web/src/lib/format-date-time{,.test}.ts`, `apps/web/src/features/timeline/**`, `apps/web/src/features/versions/version-banner.tsx`, `apps/web/src/features/versions/time-travel.test.tsx`, `e2e/timeline.ts`, `e2e/timeline.spec.ts`, `e2e/time-travel.spec.ts` | `developer-ux-timeline` |
| G2 | `apps/web/src/features/editor/**`, `apps/web/src/features/documents/**`, `apps/web/src/features/auth/**`, `apps/web/src/features/sharing/**`, `apps/web/src/features/versions/version-viewer.tsx`, `apps/web/src/lib/copy-rules.test.ts`, `libs/types/src/{documents,timeline}.ts`, `e2e/documents.spec.ts` | `developer-ux-screens` |

## Sequencing

- Task 1 (G0) runs first and alone: every other task consumes its tokens, primitives, title hook and test helpers.
- Then G1 (Tasks 2 → 3 → 4) and G2 (Tasks 5 → 6 → 7 → 8 → 9) in two worktrees, each group sequential. One worktree per developer (see `docs/learnings/2026-10-16-parallel-lanes-share-one-git-index.md`); merge G1 into the lane branch first.
- Task 3 consumes `formatBinMoment` from Task 2. Task 9's copy test asserts the timeline sentences Task 4 fixes, so Task 9 runs after G1 is merged into the lane branch.
- G1 and G2 share no file: `timeline-copy.ts` is G1's; `editor-copy.ts` and the `libs/types` copy are G2's.

## Steps

Author this list with every box empty. A sub-agent ticks its own line. A wrong step is struck through with the reason, not deleted.

### Task 1: Foundations (G0)

Covers the shared pieces of P2-5, P2-6, P2-14, P2-16, P2-2 and P3-11.

**Files:**
- Create: `apps/web/src/lib/app-copy.ts`
- Create: `apps/web/src/lib/use-document-title.ts`
- Test: `apps/web/src/lib/use-document-title.test.ts`
- Create: `apps/web/src/components/ui/skeleton.tsx`
- Create: `apps/web/src/components/ui/dropdown-menu.tsx`
- Modify: `apps/web/src/styles/globals.css` (`:root`, `.dark`, `@theme inline`)
- Modify: `apps/web/src/test-setup.ts` (a `matchMedia` double)
- Modify: `apps/web/src/testing/render-with-providers.tsx` (router `state` option)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `APP_NAME: string` from `@/lib/app-copy`.
  - `pageTitle(title: string | null): string` and `useDocumentTitle(title: string | null): void` from `@/lib/use-document-title`.
  - `Skeleton` from `@/components/ui/skeleton`; `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` (with `variant?: "default" | "destructive"`) from `@/components/ui/dropdown-menu`.
  - Tailwind colours `bg-inserted`, `bg-deleted`, `bg-online`; SuperDoc comment highlights set to `--inserted`.
  - `window.matchMedia` returns `matches: false` in every test unless a test spies on it.
  - `renderWithProviders(element, { route?, queryClient?, state? })` and `renderHookWithRouter(hook, { route?, queryClient?, state? })` where `state` becomes the router location state.

- [ ] **Step 1: Write the failing test**

```ts
import { renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';
import { APP_NAME } from './app-copy';
import { pageTitle, useDocumentTitle } from './use-document-title';

const PAGE_NAME = 'Plan';

test('a page title is followed by the app name and the app name comes back on unmount', () => {
  const { unmount } = renderHook(() => useDocumentTitle(PAGE_NAME));
  expect(document.title).toBe(pageTitle(PAGE_NAME));
  expect(document.title).toBe(`${PAGE_NAME} · ${APP_NAME}`);
  unmount();
  expect(document.title).toBe(APP_NAME);
});

test('a page without a title yet shows the app name alone', () => {
  renderHook(() => useDocumentTitle(null));
  expect(document.title).toBe(APP_NAME);
});
```

Inert stubs so the test fails on its assertion: `app-copy.ts` exports `APP_NAME = 'SuperDoc History'`; `use-document-title.ts` exports `pageTitle` returning `APP_NAME` and `useDocumentTitle` doing nothing.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @superdoc-history/web exec vitest run src/lib/use-document-title.test.ts`
Expected: FAIL with `expected 'SuperDoc History' to be 'Plan · SuperDoc History'`.

- [ ] **Step 3: Commit the red test**

```bash
git add apps/web/src/lib/app-copy.ts apps/web/src/lib/use-document-title.ts apps/web/src/lib/use-document-title.test.ts
git commit -m "test(web): pin the page title hook"
```

- [ ] **Step 4: Implement the title hook**

`apps/web/src/lib/use-document-title.ts`:

```ts
import { useEffect } from 'react';
import { APP_NAME } from './app-copy';

const TITLE_SEPARATOR = ' · ';

export function pageTitle(title: string | null): string {
  if (title === null) return APP_NAME;
  return `${title}${TITLE_SEPARATOR}${APP_NAME}`;
}

export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = pageTitle(title);
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}
```

- [ ] **Step 5: Add the shadcn primitives**

`apps/web/src/components/ui/skeleton.tsx` (shadcn new-york, same formatting as `dialog.tsx`):

```tsx
import * as React from "react"

import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  )
}

export { Skeleton }
```

`apps/web/src/components/ui/dropdown-menu.tsx` (the four parts this lane uses, verbatim from shadcn new-york; `radix-ui` already ships `DropdownMenu`, so `package.json` does not change):

```tsx
"use client"

import * as React from "react"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      {...props}
    />
  )
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md",
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem }
```

- [ ] **Step 6: Add the colour tokens**

In `apps/web/src/styles/globals.css`, append to `:root` (after `--topic-other`):

```css
  --inserted: oklch(0.93 0.07 150);
  --deleted: oklch(0.93 0.06 25);
  --online: oklch(0.65 0.17 150);
  --sd-comment-highlight-internal: var(--inserted);
  --sd-comment-highlight-external: var(--inserted);
```

Append to `.dark` (after `--topic-other`):

```css
  --inserted: oklch(0.35 0.07 150);
  --deleted: oklch(0.35 0.08 25);
  --online: oklch(0.7 0.17 150);
```

Append to `@theme inline` (after `--color-ring`):

```css
  --color-inserted: var(--inserted);
  --color-deleted: var(--deleted);
  --color-online: var(--online);
```

SuperDoc reads `--sd-comment-highlight-internal` and `--sd-comment-highlight-external` as the fallback inside its own `--sd-comments-highlight-*` variables (`node_modules/superdoc/dist/style.css`, `:root`), so these two lines recolour the viewer's run highlights without touching SuperDoc's classes.

- [ ] **Step 7: Add the test doubles**

`apps/web/src/test-setup.ts`, after the `ResizeObserver` stub:

```ts
function matchMediaDouble(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  };
}

vi.stubGlobal('matchMedia', matchMediaDouble);
```

`apps/web/src/testing/render-with-providers.tsx`: add `state = null` to both option objects and pass it to the router.

```tsx
import { createMemoryRouter, parsePath, RouterProvider } from 'react-router';

type RenderOptions = { route?: string; queryClient?: QueryClient; state?: unknown };

export function renderWithProviders(element: ReactElement, { route = AppRoute.Documents, queryClient = createTestQueryClient(), state = null }: RenderOptions = {}) {
  const router = createMemoryRouter(
    [
      { path: AppRoute.Document, element },
      { path: AppRoute.Share, element },
      { path: AppRoute.VersionView, element },
      { path: ANY_PATH, element },
    ],
    { initialEntries: [{ ...parsePath(route), state }] },
  );
  ...
}

export function renderHookWithRouter<Result>(hook: () => Result, { route = AppRoute.Documents, queryClient = createTestQueryClient(), state = null }: RenderOptions = {}) {
  ...
  const { router } = renderWithProviders(<HookProbe />, { route, queryClient, state });
  ...
}
```

- [ ] **Step 8: Run the tests and the typecheck**

Run: `pnpm --filter @superdoc-history/web exec vitest run src/lib/use-document-title.test.ts && pnpm typecheck && pnpm test:unit`
Expected: PASS everywhere; `git diff apps/web/package.json` is empty.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/lib/use-document-title.ts apps/web/src/components/ui/skeleton.tsx apps/web/src/components/ui/dropdown-menu.tsx apps/web/src/styles/globals.css apps/web/src/test-setup.ts apps/web/src/testing/render-with-providers.tsx
git commit -m "feat(web): add the page title hook, skeleton and menu primitives and the edit colours"
```

---

### Task 2: Time formats and units (G1) — P1-4, P2-1

**Files:**
- Modify: `apps/web/src/lib/format-date-time.ts`
- Test: `apps/web/src/lib/format-date-time.test.ts` (create, or extend the one lane B created)
- Modify: `apps/web/src/features/timeline/timeline-copy.ts` (units; `wordsDeltaLabel` removed)
- Test: `apps/web/src/features/timeline/timeline-copy.test.ts` (create)
- Modify: `apps/web/src/features/timeline/timeline-tooltip.tsx:68-72`
- Modify: `apps/web/src/features/timeline/top-edits.tsx:26`
- Modify: `apps/web/src/features/versions/version-banner.tsx:7-23`
- Modify: `apps/web/src/features/timeline/streamgraph.test.tsx` (tooltip text, description assertion)
- Modify: `apps/web/src/features/versions/time-travel.test.tsx:268` (loading banner text)
- Modify: `e2e/timeline.ts` (`bandNamed`)

**Interfaces:**
- Consumes: `formatTimestamp`, `formatBinRange` from lane B.
- Produces (Task 3 uses `formatBinMoment`):
  - `enum TimePrecision { Minute = 'minute', Second = 'second' }`, `precisionOf(binMs: number): TimePrecision`
  - `formatBinMoment({ time, binMs }: { time: number; binMs: number }): string`
  - `formatBinRange({ start, binMs }: { start: number; binMs: number }): string` (new behaviour)
  - `formatVersionMoment(time: number): string`
  - `enum EditUnit { Word = 'word', Character = 'character' }`, `countLabel({ count, unit }: { count: number; unit: EditUnit }): string`, `editDeltaLabel({ inserted, deleted, unit }: { inserted: number; deleted: number; unit: EditUnit }): string`

- [x] **Step 1: Write the failing tests** (6f68162)

`apps/web/src/lib/format-date-time.test.ts`:

```ts
import { MINUTE_MS, SECOND_MS } from '@superdoc-history/types';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { formatBinMoment, formatBinRange, formatVersionMoment } from './format-date-time';

const NOW = new Date(2026, 9, 17, 7, 50, 0).getTime();
const BIN_START = new Date(2026, 9, 17, 7, 45, 10).getTime();
const LAST_YEAR_BIN_START = new Date(2025, 9, 17, 7, 45, 0).getTime();
const SECONDS_BIN_MS = 10 * SECOND_MS;
const CLOCK_WITH_SECONDS = /\d{1,2}:\d{2}:\d{2}/g;
const MONTH_LABEL = new Intl.DateTimeFormat(undefined, { month: 'short' }).format(BIN_START);
const CURRENT_YEAR = '2026';
const LAST_YEAR = '2025';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

function occurrences({ text, part }: { text: string; part: string }): number {
  return text.split(part).length - 1;
}

test('a bin under a minute shows both ends with seconds and the date once', () => {
  const range = formatBinRange({ start: BIN_START, binMs: SECONDS_BIN_MS });
  expect(range.match(CLOCK_WITH_SECONDS)).toHaveLength(2);
  expect(occurrences({ text: range, part: MONTH_LABEL })).toBe(1);
  expect(range).not.toContain(CURRENT_YEAR);
});

test('a minute bin shows minutes and the date once', () => {
  const range = formatBinRange({ start: BIN_START, binMs: MINUTE_MS });
  expect(range.match(CLOCK_WITH_SECONDS)).toBeNull();
  expect(occurrences({ text: range, part: MONTH_LABEL })).toBe(1);
});

test('a bin from an earlier year carries its year', () => {
  expect(formatBinRange({ start: LAST_YEAR_BIN_START, binMs: MINUTE_MS })).toContain(LAST_YEAR);
});

test('a bin moment follows the precision of its bins', () => {
  expect(formatBinMoment({ time: BIN_START, binMs: SECONDS_BIN_MS }).match(CLOCK_WITH_SECONDS)).toHaveLength(1);
  expect(formatBinMoment({ time: BIN_START, binMs: MINUTE_MS }).match(CLOCK_WITH_SECONDS)).toBeNull();
});

test('two versions seconds apart today read differently and carry no date', () => {
  expect(formatVersionMoment(BIN_START)).not.toBe(formatVersionMoment(BIN_START + SECONDS_BIN_MS));
  expect(formatVersionMoment(BIN_START)).not.toContain(MONTH_LABEL);
});
```

`apps/web/src/features/timeline/timeline-copy.test.ts`:

```ts
import { expect, test } from 'vitest';
import { bandAriaLabel, editDeltaLabel, EditUnit } from './timeline-copy';

test.each([
  { inserted: 2, deleted: 0, unit: EditUnit.Word, expected: '+2 words' },
  { inserted: 1, deleted: 0, unit: EditUnit.Word, expected: '+1 word' },
  { inserted: 0, deleted: 3, unit: EditUnit.Character, expected: '−3 characters' },
  { inserted: 12, deleted: 1, unit: EditUnit.Word, expected: '+12 words −1 word' },
  { inserted: 0, deleted: 0, unit: EditUnit.Word, expected: '0 words' },
])('$inserted inserted and $deleted deleted read "$expected"', ({ inserted, deleted, unit, expected }) => {
  expect(editDeltaLabel({ inserted, deleted, unit })).toBe(expected);
});

test('a band of one character is singular and an empty band is plural', () => {
  expect(bandAriaLabel({ name: 'Budget', volume: 1 })).toBe('Budget, 1 character');
  expect(bandAriaLabel({ name: 'Budget', volume: 0 })).toBe('Budget, 0 characters');
});
```

In `streamgraph.test.tsx`, change the hover test's `'+120 −0'` expectation to `'+120 characters'` and add `expect(tooltip).not.toHaveTextContent('−0');`.

Inert stubs: `format-date-time.ts` exports `formatBinMoment` returning `formatTimestamp(time)` and `formatVersionMoment` returning `formatTimestamp(time)`; `timeline-copy.ts` exports `EditUnit` and `editDeltaLabel` returning `wordsDeltaLabel({ inserted, deleted })`.

- [x] **Step 2: Run the tests to verify they fail** (6f68162, 11 red on their assertions)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/lib/format-date-time.test.ts src/features/timeline/timeline-copy.test.ts src/features/timeline/streamgraph.test.tsx`
Expected: FAIL on `expected null to have a length of 2` (no seconds today), on `expected '+1 words −0 words' to be '+1 word'`, on `'Budget, 1 characters'`, and on the tooltip's `'+120 characters'`.

- [x] **Step 3: Commit the red tests** (6f68162)

```bash
git add apps/web/src/lib/format-date-time.ts apps/web/src/lib/format-date-time.test.ts apps/web/src/features/timeline/timeline-copy.ts apps/web/src/features/timeline/timeline-copy.test.ts apps/web/src/features/timeline/streamgraph.test.tsx
git commit -m "test(web): pin bin ranges with one date and labelled edit units"
```

- [x] **Step 4: Implement the formatters** (9c931ec)

`apps/web/src/lib/format-date-time.ts` (keep lane B's `formatTimestamp` as it is):

```ts
import { MINUTE_MS } from '@superdoc-history/types';

const TIMESTAMP_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const VERSION_TIME_FORMAT = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' });
const DATED_VERSION_TIME_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
const MINUTE_PARTS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
const SECOND_PARTS: Intl.DateTimeFormatOptions = { ...MINUTE_PARTS, second: '2-digit' };
const YEAR_PART: Intl.DateTimeFormatOptions = { year: 'numeric' };

export enum TimePrecision {
  Minute = 'minute',
  Second = 'second',
}

const PARTS_BY_PRECISION: Record<TimePrecision, Intl.DateTimeFormatOptions> = {
  [TimePrecision.Minute]: MINUTE_PARTS,
  [TimePrecision.Second]: SECOND_PARTS,
};

export function precisionOf(binMs: number): TimePrecision {
  if (binMs < MINUTE_MS) return TimePrecision.Second;
  return TimePrecision.Minute;
}

function isThisYear(time: number): boolean {
  return new Date(time).getFullYear() === new Date().getFullYear();
}

function isToday(time: number): boolean {
  return new Date(time).toDateString() === new Date().toDateString();
}

function binFormat({ time, binMs }: { time: number; binMs: number }): Intl.DateTimeFormat {
  const parts = PARTS_BY_PRECISION[precisionOf(binMs)];
  if (isThisYear(time)) return new Intl.DateTimeFormat(undefined, parts);
  return new Intl.DateTimeFormat(undefined, { ...parts, ...YEAR_PART });
}

export function formatTimestamp(time: number): string {
  return TIMESTAMP_FORMAT.format(time);
}

export function formatBinMoment({ time, binMs }: { time: number; binMs: number }): string {
  return binFormat({ time, binMs }).format(time);
}

export function formatBinRange({ start, binMs }: { start: number; binMs: number }): string {
  return binFormat({ time: start, binMs }).formatRange(start, start + binMs);
}

export function formatVersionMoment(time: number): string {
  if (isToday(time)) return VERSION_TIME_FORMAT.format(time);
  return DATED_VERSION_TIME_FORMAT.format(time);
}
```

If lane B moved `RANGE_SEPARATOR` here, delete it: `formatRange` owns the separator.

- [x] **Step 5: Implement the units** (9c931ec)

`apps/web/src/features/timeline/timeline-copy.ts`: delete `wordsDeltaLabel`, rewrite `bandAriaLabel`, add:

```ts
const INSERTED_SIGN = '+';
const DELETED_SIGN = '−';
const SINGLE_COUNT = 1;

export enum EditUnit {
  Word = 'word',
  Character = 'character',
}

const UNIT_LABELS: Record<EditUnit, { one: string; many: string }> = {
  [EditUnit.Word]: { one: 'word', many: 'words' },
  [EditUnit.Character]: { one: 'character', many: 'characters' },
};

export function countLabel({ count, unit }: { count: number; unit: EditUnit }): string {
  if (count === SINGLE_COUNT) return `${count} ${UNIT_LABELS[unit].one}`;
  return `${count} ${UNIT_LABELS[unit].many}`;
}

export function editDeltaLabel({ inserted, deleted, unit }: { inserted: number; deleted: number; unit: EditUnit }): string {
  const sides = [
    { sign: INSERTED_SIGN, count: inserted },
    { sign: DELETED_SIGN, count: deleted },
  ].filter((side) => side.count > 0);
  if (sides.length === 0) return countLabel({ count: 0, unit });
  return sides.map((side) => `${side.sign}${countLabel({ count: side.count, unit })}`).join(' ');
}

export function bandAriaLabel({ name, volume }: { name: string; volume: number }): string {
  return `${name}, ${countLabel({ count: volume, unit: EditUnit.Character })}`;
}
```

`timeline-tooltip.tsx`, the row:

```tsx
<p key={band.id}>
  {band.name} {editDeltaLabel({ inserted: cell!.inserted, deleted: cell!.deleted, unit: EditUnit.Character })} · {cell!.authorKeys.map((authorKey) => authorOf({ authors: timeline.authors, authorKey }).name).join(', ')}
</p>
```

`top-edits.tsx`:

```tsx
{contributors && <p className="text-xs text-muted-foreground">{editDeltaLabel({ ...sumWords(contributors), unit: EditUnit.Word })}</p>}
```

`features/versions/version-banner.tsx`: delete `MOMENT_FORMAT`, `DATED_MOMENT_FORMAT` and `formatMoment`; use the shared formatter in both messages.

```tsx
import { formatVersionMoment } from '@/lib/format-date-time';

function loadingMessage(timeTravel: TimeTravel): string {
  if (timeTravel.requestedBinEnd === null) return LOADING_VERSION_MESSAGE;
  return `${LOADING_VERSION_MESSAGE} ${formatVersionMoment(timeTravel.requestedBinEnd)}`;
}

function bannerMessage(timeTravel: TimeTravel): string {
  if (timeTravel.hasFailed) return VERSION_FAILED_MESSAGE;
  if (timeTravel.isLoading || !timeTravel.shown) return loadingMessage(timeTravel);
  return versionAtLabel(formatVersionMoment(timeTravel.shown.serverTime));
}
```

In `features/versions/time-travel.test.tsx:268`, compute `endOfPeriod` with `formatVersionMoment` instead of `formatTimestamp`. In `streamgraph.test.tsx`, the description test asserts `toContain(formatTimestamp(timeline.bins[0]!.start))` instead of splitting `formatBinRange`.

`e2e/timeline.ts`, `bandNamed` matches both the plural and the singular label:

```ts
const SINGLE_CHARACTER_VOLUME = 1;

export function bandNamed({ page, name }: { page: Page; name: string }): Locator {
  const many = escapeRegex(bandAriaLabel({ name, volume: VOLUME_PLACEHOLDER })).replace(String(VOLUME_PLACEHOLDER), VOLUME_PATTERN);
  const one = escapeRegex(bandAriaLabel({ name, volume: SINGLE_CHARACTER_VOLUME }));
  return page.getByLabel(new RegExp(`^(${many}|${one})$`));
}
```

- [x] **Step 6: Run the tests** (9c931ec, web 230/230)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/lib src/features/timeline src/features/versions && pnpm typecheck`
Expected: PASS. `rg -n "wordsDeltaLabel|formatMoment\b" apps/web/src e2e` prints nothing.

- [x] **Step 7: Commit** (9c931ec)

```bash
git add apps/web/src/lib/format-date-time.ts apps/web/src/features/timeline/timeline-copy.ts apps/web/src/features/timeline/timeline-tooltip.tsx apps/web/src/features/timeline/top-edits.tsx apps/web/src/features/timeline/streamgraph.test.tsx apps/web/src/features/versions/version-banner.tsx apps/web/src/features/versions/time-travel.test.tsx e2e/timeline.ts
git commit -m "fix(web): name the date once in bin ranges and label every edit count"
```

---

### Task 3: Timeline panel layout and chart (G1) — P1-2, P1-3, P3-6, P3-7, P3-8

**Files:**
- Modify: `apps/web/src/features/timeline/timeline-panel.tsx:102-106` (aside, handle, header)
- Modify: `apps/web/src/features/timeline/streamgraph.tsx`
- Create: `apps/web/src/features/timeline/streamgraph-legend.tsx`
- Create: `apps/web/src/features/timeline/topic-swatch.tsx`
- Modify: `apps/web/src/features/timeline/topic-chip.tsx`
- Modify: `apps/web/src/features/timeline/timeline-copy.ts` (`CHART_HINT`, `LEGEND_LABEL`)
- Test: `apps/web/src/features/timeline/streamgraph.test.tsx`, `apps/web/src/features/timeline/timeline-panel.test.tsx`

**Interfaces:**
- Consumes: `formatBinMoment({ time, binMs })` from Task 2; `saturationOf` from `streamgraph-layout.ts`.
- Produces:
  - `export enum PanelState { Open = 'open', Collapsed = 'collapsed' }` from `timeline-panel.tsx`, rendered as `aside[data-state]`.
  - `TopicSwatch({ band, maxVolume }: { band: TimelineBand; maxVolume: number })`.
  - `StreamgraphLegend({ bands, maxVolume }: { bands: TimelineBand[]; maxVolume: number })`.
  - `CHART_HINT`, `LEGEND_LABEL` in `timeline-copy.ts`.

- [x] **Step 1: Write the failing tests** (105efae)

Append to `streamgraph.test.tsx` (add `within` to the Testing Library import, `formatBinMoment` from `@/lib/format-date-time`, `CHART_HINT, LEGEND_LABEL` from `./timeline-copy`):

```tsx
const LABELLED_TIMELINE = timelineWith({ volumes: Array.from({ length: 60 }, () => [400, 300]), names: ['Budget', 'Hiring'] });

test('the chart shows its first and last moment and how to travel in time', () => {
  renderGraph();
  expect(screen.getByText(formatBinMoment({ time: timeline.bins[0]!.start, binMs: timeline.binMs }))).toBeVisible();
  expect(screen.getByText(formatBinMoment({ time: timeline.bins[2]!.start + timeline.binMs, binMs: timeline.binMs }))).toBeVisible();
  expect(screen.getByText(CHART_HINT)).toBeVisible();
});

test('bands without a label are named in a legend', () => {
  renderGraph();
  const legend = screen.getByRole('list', { name: LEGEND_LABEL });
  expect(within(legend).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Budget', 'Hiring', 'Other']);
});

test('a chart whose bands all carry their label has no legend', () => {
  render(<Streamgraph timeline={LABELLED_TIMELINE} width={WIDTH} selectedIndex={null} highlightedBandId={null} onSelectIndex={vi.fn()} onClearSelection={vi.fn()} />);
  expect(screen.queryByRole('list', { name: LEGEND_LABEL })).not.toBeInTheDocument();
});

test('a pointer selection does not pin the tooltip, the next arrow key shows it', () => {
  const { container } = renderGraph({ selectedIndex: 1 });
  fireEvent.pointerDown(container.querySelector('svg')!, { clientX: WIDTH / 2, buttons: 1 });
  fireEvent.focus(budgetBand());
  expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  fireEvent.keyDown(budgetBand(), { key: 'ArrowRight' });
  expect(screen.getByRole('tooltip')).toBeInTheDocument();
});

test('the chart is one tab stop on the active band', () => {
  const { container, rerender } = renderGraph();
  expect(container.querySelectorAll('path[tabindex="0"]')).toHaveLength(1);
  expect(budgetBand()).toHaveAttribute('tabindex', '0');
  rerender(<Streamgraph timeline={timeline} width={WIDTH} selectedIndex={1} highlightedBandId={timeline.bands[1]!.id} onSelectIndex={vi.fn()} onClearSelection={vi.fn()} />);
  expect(screen.getByLabelText(/^Hiring/)).toHaveAttribute('tabindex', '0');
  expect(budgetBand()).toHaveAttribute('tabindex', '-1');
});
```

`LABELLED_TIMELINE` places both labels (same shape as `streamgraph-layout.test.ts` "labels sit inside thick bands"); confirm with `layoutStreamgraph({ timeline: LABELLED_TIMELINE, width: WIDTH }).shapes.every((shape) => shape.label !== null)` in a scratch run before relying on it, and widen the bins if it is false.

Append to `timeline-panel.test.tsx` (import `PanelState` from `./timeline-panel`):

```tsx
test('collapsing the panel drops its width and the resize handle', async () => {
  mockTimelineApi();
  renderPanel();
  expect(await screen.findByRole('separator', { name: RESIZE_PANEL_LABEL })).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: TIMELINE_TOGGLE_LABEL }));
  expect(screen.queryByRole('separator', { name: RESIZE_PANEL_LABEL })).not.toBeInTheDocument();
  expect(screen.getByRole('complementary')).toHaveAttribute('data-state', PanelState.Collapsed);
});
```

Inert stubs: `CHART_HINT`, `LEGEND_LABEL` constants and `export enum PanelState` exist, unused.

- [x] **Step 2: Run the tests to verify they fail** (105efae, 5 red on their assertions)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features/timeline/streamgraph.test.tsx src/features/timeline/timeline-panel.test.tsx`
Expected: FAIL on `Unable to find an element with the text` (time labels, hint), `Unable to find role="list"`, the pinned tooltip found, `expected 3 to have length 1` tab stops, and the separator still present.

- [x] **Step 3: Commit the red tests** (105efae)

```bash
git add apps/web/src/features/timeline/streamgraph.test.tsx apps/web/src/features/timeline/timeline-panel.test.tsx apps/web/src/features/timeline/timeline-copy.ts apps/web/src/features/timeline/timeline-panel.tsx
git commit -m "test(web): pin the explained chart and the collapsed rail"
```

- [x] **Step 4: Implement the collapsed rail** (eb360f3)

`timeline-panel.tsx` (import `cn` from `@/lib/utils`):

```tsx
export enum PanelState {
  Open = 'open',
  Collapsed = 'collapsed',
}
```

```tsx
<aside
  data-state={isOpen ? PanelState.Open : PanelState.Collapsed}
  className={cn('flex max-h-[50dvh] w-full shrink-0 border-t lg:max-h-none lg:border-t-0 lg:border-l', isOpen ? 'lg:w-[var(--panel-width)]' : 'lg:w-auto')}
  style={{ '--panel-width': `${width}px` } as CSSProperties}
>
  {isOpen && <ResizeHandle width={width} maxWidth={maxWidth} resizeTo={resizeTo} resizeBy={resizeBy} />}
  <div className="flex min-w-0 flex-1 flex-col">
    <header className={cn('flex flex-wrap items-center justify-between gap-x-2 gap-y-1 p-2', !isOpen && 'lg:flex-col')}>
      <h2 className={cn('px-2 text-sm font-medium', !isOpen && 'lg:sr-only')}>{TIMELINE_HEADING}</h2>
```

The rest of the header and body is unchanged in this task.

- [x] **Step 5: Implement the swatch, legend and chip ring** (eb360f3)

`topic-swatch.tsx`:

```tsx
import { TimelineBandKind, type TimelineBand } from '@superdoc-history/types';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { saturationOf } from './streamgraph-layout';

export function TopicSwatch({ band, maxVolume }: { band: TimelineBand; maxVolume: number }) {
  const isOther = band.kind === TimelineBandKind.Other;
  const swatchStyle = { '--topic-hue': String(band.hue), '--topic-saturation': `${saturationOf({ volume: band.volume, maxVolume })}%` } as CSSProperties;
  return <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', isOther ? 'topic-swatch-other' : 'topic-swatch')} style={isOther ? undefined : swatchStyle} />;
}
```

`topic-chip.tsx`: replace the inline swatch with `<TopicSwatch band={band} maxVolume={maxVolume} />`, drop the now unused imports, and give the button the `Button` focus ring:

```tsx
<button
  type="button"
  aria-pressed={isActive}
  onClick={toggle}
  className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50', isActive && 'bg-accent')}
>
  <TopicSwatch band={band} maxVolume={maxVolume} />
  {band.name}
</button>
```

`streamgraph-legend.tsx`:

```tsx
import type { TimelineBand } from '@superdoc-history/types';
import { LEGEND_LABEL } from './timeline-copy';
import { TopicSwatch } from './topic-swatch';

export function StreamgraphLegend({ bands, maxVolume }: { bands: TimelineBand[]; maxVolume: number }) {
  return (
    <ul aria-label={LEGEND_LABEL} className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {bands.map((band) => (
        <li key={band.id} className="flex items-center gap-1.5">
          <TopicSwatch band={band} maxVolume={maxVolume} />
          {band.name}
        </li>
      ))}
    </ul>
  );
}
```

`timeline-copy.ts`:

```ts
export const CHART_HINT = 'Click the chart or use ← → to see the document at that moment.';
export const LEGEND_LABEL = 'Topics';
```

- [x] **Step 6: Implement the chart changes** (eb360f3)

`streamgraph.tsx`:

```tsx
function focusableBandIdOf({ shapes, highlightedBandId }: { shapes: BandShape[]; highlightedBandId: string | null }): string | null {
  const highlighted = shapes.find((shape) => shape.band.id === highlightedBandId);
  if (highlighted) return highlighted.band.id;
  const [first] = shapes;
  if (!first) return null;
  return first.band.id;
}
```

In the component: add `useRef` to the React import, rename `hasFocus` to `hasKeyboardFocus`, add `const isPointerFocus = useRef(false);`, and compute

```tsx
const maxVolume = Math.max(0, ...timeline.bands.map((band) => band.volume));
const focusableBandId = focusableBandIdOf({ shapes: layout.shapes, highlightedBandId });
const hasUnlabelledBand = layout.shapes.some((shape) => shape.label === null);
const firstMoment = timeline.bins[0]!.start;
const lastMoment = timeline.bins[lastIndex]!.start + timeline.binMs;
```

(after the `bins.length === 0` early return). Handlers:

```tsx
function handlePointerDown(event: PointerEvent<SVGSVGElement>): void {
  isPointerFocus.current = true;
  onSelectIndex(layout.binAt(offsetOf(event)));
}

function handleFocus(): void {
  setHasKeyboardFocus(!isPointerFocus.current);
}

function handleBlur(): void {
  isPointerFocus.current = false;
  setHasKeyboardFocus(false);
}

function handleKeyDown(event: KeyboardEvent<SVGPathElement>): void {
  isPointerFocus.current = false;
  setHasKeyboardFocus(true);
  if (event.key === NavigationKey.Clear) {
    event.stopPropagation();
    onClearSelection();
    return;
  }
  const index = nextIndex({ key: event.key, selectedIndex, lastIndex });
  if (index === null) return;
  event.preventDefault();
  onSelectIndex(index);
}
```

The path gets `tabIndex={shape.band.id === focusableBandId ? 0 : -1}`, `onFocus={handleFocus}`, `onBlur={handleBlur}`; `tooltipAnchorOf` receives `hasFocus: hasKeyboardFocus`. The returned markup:

```tsx
<div className="relative flex flex-col gap-1">
  <svg ...unchanged>...</svg>
  <div className="flex justify-between text-xs text-muted-foreground">
    <time dateTime={new Date(firstMoment).toISOString()}>{formatBinMoment({ time: firstMoment, binMs: timeline.binMs })}</time>
    <time dateTime={new Date(lastMoment).toISOString()}>{formatBinMoment({ time: lastMoment, binMs: timeline.binMs })}</time>
  </div>
  {hasUnlabelledBand && <StreamgraphLegend bands={layout.shapes.map((shape) => shape.band)} maxVolume={maxVolume} />}
  <p className="text-xs text-muted-foreground">{CHART_HINT}</p>
  {tooltipAnchor !== null && <TimelineTooltip ...unchanged />}
</div>
```

The hooks (`useRef`, `useState`, `useMemo`) stay above the early return, as today.

- [x] **Step 7: Run the tests** (eb360f3, web 236/236)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features/timeline && pnpm typecheck`
Expected: PASS, including the existing focus, Escape and tooltip tests (they focus without a pointer, so the keyboard tooltip still shows).

- [x] **Step 8: Commit** (eb360f3)

```bash
git add apps/web/src/features/timeline/timeline-panel.tsx apps/web/src/features/timeline/streamgraph.tsx apps/web/src/features/timeline/streamgraph-legend.tsx apps/web/src/features/timeline/topic-swatch.tsx apps/web/src/features/timeline/topic-chip.tsx apps/web/src/features/timeline/timeline-copy.ts
git commit -m "fix(web): explain the chart, collapse the panel to a rail and keep one tab stop"
```

---

### Task 4: Summary card and panel content (G1) — P1-5, P2-11, P2-12, P2-14, P2-15, P3-12, and the timeline sentences of P2-17

**Files:**
- Modify: `apps/web/src/features/timeline/timeline-panel.tsx` (order of the body, Regroup topics)
- Modify: `apps/web/src/features/timeline/selection-summary-card.tsx`
- Modify: `apps/web/src/features/timeline/timeline-notices.tsx:26`
- Modify: `apps/web/src/features/timeline/top-edits.tsx`
- Modify: `apps/web/src/features/timeline/bin-edits.tsx:39-49`
- Modify: `apps/web/src/features/timeline/filter-box.tsx:42-50`
- Modify: `apps/web/src/features/timeline/use-timeline-search.ts:4` (export `AUTHOR_PREFIX`)
- Modify: `apps/web/src/features/timeline/timeline-copy.ts`
- Modify: `e2e/timeline.spec.ts`, `e2e/time-travel.spec.ts` (import `REGROUP_TOPICS_LABEL`)
- Test: `apps/web/src/features/timeline/timeline-panel.test.tsx`, `apps/web/src/features/timeline/filter-box.test.tsx`, `apps/web/src/features/timeline/top-edits.test.tsx`

**Interfaces:**
- Consumes: `bg-inserted`, `bg-deleted` from Task 1.
- Produces: `REGROUP_TOPICS_LABEL` (replaces `REFRESH_TOPICS_LABEL`), `REGROUPING_TOPICS_MESSAGE`, `NOTHING_TO_GROUP_MESSAGE`, exported `AUTHOR_PREFIX`.

- [x] **Step 1: Write the failing tests** (f859ee5)

`timeline-panel.test.tsx` (rename every `REFRESH_TOPICS_LABEL` import and use to `REGROUP_TOPICS_LABEL`; import `NOTHING_TO_GROUP_MESSAGE`, `TOP_EDITS_LABEL`, and `beforeEach` from `vitest`):

```tsx
const scrollIntoView = vi.fn();

beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockClear();
});

test('the summary card sits under the filter, before the top edits, and scrolls into view when it starts', async () => {
  mockTimelineApi({ selectionViews: [NONE_VIEW, RUNNING_VIEW] });
  renderPanel();
  await userEvent.click(await screen.findByRole('button', { name: SUMMARIZE_EDITS_LABEL }));
  const running = await screen.findByText(SUMMARIZING_EDITS_MESSAGE);
  const topEdits = screen.getByRole('heading', { name: TOP_EDITS_LABEL });
  expect(screen.getByLabelText(FILTER_LABEL).compareDocumentPosition(running) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(running.compareDocumentPosition(topEdits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
});

test('a summary already cached when the panel opens does not scroll the page', async () => {
  mockTimelineApi({ selectionViews: [READY_VIEW] });
  renderPanel();
  expect(await screen.findByText(READY_VIEW.summary!.sentence)).toBeInTheDocument();
  expect(scrollIntoView).not.toHaveBeenCalled();
});

test('an empty document says only that there are no edits and explains the disabled Regroup topics', async () => {
  const emptyPending: DocumentTimeline = { ...timelineWith({ volumes: [], names: [] }), topics: { state: TopicState.Pending, failure: null, computedAtSequence: null } };
  mockTimelineApi({ timeline: emptyPending });
  renderPanel();
  expect(await screen.findByText(NO_EDITS_YET_MESSAGE)).toBeInTheDocument();
  expect(screen.queryByText(TOPICS_PENDING_MESSAGE)).not.toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: TOP_EDITS_LABEL })).not.toBeInTheDocument();
  const regroup = screen.getByRole('button', { name: REGROUP_TOPICS_LABEL });
  expect(regroup).toBeDisabled();
  expect(regroup).toHaveAccessibleDescription(NOTHING_TO_GROUP_MESSAGE);
  expect(screen.getByText(NOTHING_TO_GROUP_MESSAGE)).toBeVisible();
});

test('bin edits mark insertions and deletions without quotes or padding', async () => {
  const edits: BinEdits = {
    binStart: baseTimeline.bins[1]!.start,
    binMs: baseTimeline.binMs,
    runs: [{ blockId: 'block-1', bandId: baseTimeline.bands[0]!.id, authorKeys: ['ana'], inserted: ' More money', deleted: 'old ', lastServerTime: 1 }],
    authors: { ana: { id: '1', name: 'Ana' } },
  };
  mockTimelineApi({ edits });
  renderPanel({ route: `${ROUTE}?at=${baseTimeline.bins[1]!.start}` });
  expect((await screen.findByText('More money')).tagName).toBe('INS');
  expect(screen.getByText('old').tagName).toBe('DEL');
});
```

Update the existing "cut snippets" test: `findByText('hello')` and `getByText(`${'x'.repeat(SNIPPET_MAX_CHARACTERS)}…`)` instead of the quoted forms.

`filter-box.test.tsx`:

```tsx
test('a person chip reads @name and a text chip does not', () => {
  renderWithProviders(<FilterBox />, { route: `${ROUTE}?${TimelineSearchParam.Term}=Bruno&${TimelineSearchParam.Author}=Bruno` });
  expect(screen.getByRole('button', { name: removeFilterLabel('@Bruno') })).toHaveTextContent('@Bruno');
  expect(screen.getByRole('button', { name: removeFilterLabel('Bruno') })).toHaveTextContent(/^Bruno$/);
});
```

Update the existing first test's chip name to `` `${REMOVE_FILTER_LABEL} @bruno` ``.

`top-edits.test.tsx`:

```tsx
test('no band with edits renders nothing, not an empty heading', () => {
  renderWithProviders(<TopEdits timeline={timelineWith({ volumes: [[0]], names: ['Budget'] })} summaries={undefined} />);
  expect(screen.queryByRole('heading', { name: TOP_EDITS_LABEL })).not.toBeInTheDocument();
});
```

Inert stubs: `REGROUP_TOPICS_LABEL` exported with the old value `'Refresh topics'`, `NOTHING_TO_GROUP_MESSAGE` and `REGROUPING_TOPICS_MESSAGE` exported, `AUTHOR_PREFIX` exported. Update `e2e/timeline.spec.ts` and `e2e/time-travel.spec.ts` to import `REGROUP_TOPICS_LABEL`.

- [x] **Step 2: Run the tests to verify they fail** (f859ee5, 7 red on their assertions)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features/timeline`
Expected: FAIL on document order (the card renders after Top edits), `scrollIntoView` never called, `TOPICS_PENDING_MESSAGE` found, the Top edits heading found, `regroup` enabled, `tagName` `P` instead of `INS`, chip text `Bruno` instead of `@Bruno`.

- [x] **Step 3: Commit the red tests** (f859ee5)

```bash
git add apps/web/src/features/timeline/timeline-panel.test.tsx apps/web/src/features/timeline/filter-box.test.tsx apps/web/src/features/timeline/top-edits.test.tsx apps/web/src/features/timeline/timeline-copy.ts apps/web/src/features/timeline/use-timeline-search.ts apps/web/src/features/timeline/timeline-panel.tsx e2e/timeline.spec.ts e2e/time-travel.spec.ts
git commit -m "test(web): pin the summary card position and a consistent empty panel"
```

- [x] **Step 4: Implement the copy** (dd71f7c)

`timeline-copy.ts`:

```ts
export const REGROUP_TOPICS_LABEL = 'Regroup topics';
export const REGROUPING_TOPICS_MESSAGE = 'Regrouping topics…';
export const NOTHING_TO_GROUP_MESSAGE = 'No edits to group into topics yet';
export const SUMMARY_UP_TO_DATE_MESSAGE = 'The summary is up to date.';
export const SUMMARIES_UNAVAILABLE_MESSAGE = 'Summaries are unavailable.';
```

(`REFRESH_TOPICS_LABEL` is deleted.)

- [x] **Step 5: Implement the panel** (dd71f7c)

`timeline-panel.tsx`:

```tsx
function regroupDisabledReason({ timeline, isPending }: { timeline: DocumentTimeline | undefined; isPending: boolean }): string | null {
  if (isPending) return REGROUPING_TOPICS_MESSAGE;
  if (timeline && timeline.bins.length === 0) return NOTHING_TO_GROUP_MESSAGE;
  return null;
}
```

In the component: `const regroupReasonId = useId();` and `const regroupReason = regroupDisabledReason({ timeline, isPending: refresh.isPending });`. The button and its reason:

```tsx
{isOpen && canRefresh && (
  <Button type="button" variant="outline" size="sm" disabled={regroupReason !== null} aria-describedby={regroupReason === null ? undefined : regroupReasonId} onClick={() => refresh.mutate()}>
    {REGROUP_TOPICS_LABEL}
  </Button>
)}
```

```tsx
{isOpen && canRefresh && regroupReason !== null && <p id={regroupReasonId} className="basis-full px-2 text-xs text-muted-foreground">{regroupReason}</p>}
```

The body order:

```tsx
<FilterBox />
<SelectionSummaryCard view={selectionSummary} error={summaryError} canRequest={canRefresh} isPending={summarize.isPending} onRetry={() => summarize.mutate(selection)} />
{timeline && selectedBin && <BinEdits documentId={documentId} timeline={timeline} bin={selectedBin} filter={search.filter} />}
{timeline && !selectedBin && <TopEdits timeline={timeline} summaries={summaries} />}
```

- [x] **Step 6: Implement the card** (dd71f7c)

`selection-summary-card.tsx`:

```tsx
const RUNNING_REVEAL_KEY = 'running';

function useRevealOnChange({ revealKey, targetRef }: { revealKey: string | undefined; targetRef: RefObject<HTMLElement | null> }): void {
  const lastRevealKey = useRef(revealKey);
  useEffect(() => {
    if (lastRevealKey.current === revealKey) return;
    lastRevealKey.current = revealKey;
    targetRef.current?.scrollIntoView({ block: 'nearest' });
  }, [revealKey, targetRef]);
}
```

In `SummarySection`, above the `hasContent` early return:

```tsx
const sectionRef = useRef<HTMLElement>(null);
useRevealOnChange({ revealKey: isRunning ? RUNNING_REVEAL_KEY : summary?.key, targetRef: sectionRef });
```

and the section becomes `<section ref={sectionRef} aria-labelledby={headingId} className="flex flex-col gap-2 rounded-md border p-3">`.

- [x] **Step 7: Implement the empty states, snippets and chips** (dd71f7c)

`timeline-notices.tsx`:

```tsx
const isNamingTopics = topics.state === TopicState.Pending && bins.length > 0;
...
{isNamingTopics && <p role="status">{TOPICS_PENDING_MESSAGE}</p>}
```

`top-edits.tsx`, after computing `rows`: `if (rows.length === 0) return null;`

`bin-edits.tsx`:

```tsx
function renderRun(run: EditRunView) {
  const band = timeline.bands.find((candidate) => candidate.id === run.bandId);
  if (!band) throw new MissingBandError(run.bandId);
  const inserted = run.inserted.trim();
  const deleted = run.deleted.trim();
  return (
    <li key={`${run.blockId}-${run.bandId}`} className="flex flex-col items-start gap-1">
      <div className="flex w-full items-center justify-between gap-2">...unchanged</div>
      {inserted && <ins className="rounded-sm bg-inserted px-1 text-sm no-underline">{snippetOf(inserted)}</ins>}
      {deleted && <del className="rounded-sm bg-deleted px-1 text-sm">{snippetOf(deleted)}</del>}
    </li>
  );
}
```

and `{data.runs.length === 0 && <p role="status" className="text-sm text-muted-foreground">{NO_EDITS_IN_BIN_MESSAGE}</p>}`.

`filter-box.tsx` (import `AUTHOR_PREFIX` from `./use-timeline-search`):

```tsx
function chipText({ param, value }: { param: TimelineSearchParam; value: string }): string {
  if (param === TimelineSearchParam.Author) return `${AUTHOR_PREFIX}${value}`;
  return value;
}
```

The chip renders `chipText({ param: chip.param, value: chip.value! })` as its text and in `removeFilterLabel(...)`.

- [x] **Step 8: Run the tests** (dd71f7c, web 242/242)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features/timeline && pnpm typecheck`
Expected: PASS. `rg -n "REFRESH_TOPICS_LABEL" apps e2e` prints nothing.

- [x] **Step 9: Commit** (dd71f7c)

```bash
git add apps/web/src/features/timeline/timeline-panel.tsx apps/web/src/features/timeline/selection-summary-card.tsx apps/web/src/features/timeline/timeline-notices.tsx apps/web/src/features/timeline/top-edits.tsx apps/web/src/features/timeline/bin-edits.tsx apps/web/src/features/timeline/filter-box.tsx apps/web/src/features/timeline/timeline-copy.ts
git commit -m "fix(web): put the summary under the filters and keep the empty panel consistent"
```

---

### Task 5: Editor header and navigation (G2) — P1-1, P2-5 (document page), P2-6 (document page), P2-16

**Files:**
- Create: `apps/web/src/features/editor/home-link.tsx`
- Modify: `apps/web/src/features/editor/editor-header.tsx`
- Modify: `apps/web/src/features/editor/members.tsx`
- Modify: `apps/web/src/features/editor/document-page.tsx`
- Modify: `apps/web/src/features/editor/editor-copy.ts`
- Test: `apps/web/src/features/editor/editor-header.test.tsx`, `apps/web/src/features/editor/document-page.test.tsx`

**Interfaces:**
- Consumes: `APP_NAME`, `useDocumentTitle`, `pageTitle`, `Skeleton`, `bg-online` from Task 1.
- Produces:
  - `HomeLink()` from `features/editor/home-link.tsx`.
  - `HOME_LINK_LABEL`, `memberLabel({ name, isOnline }: { name: string; isOnline: boolean }): string` in `editor-copy.ts`.
  - `EditorHeader({ opened, members, currentUserId, onDownload }: { opened: OpenedDocument; members: DocumentMember[]; currentUserId: string | null; onDownload: (() => void) | null })`.
  - `Members({ members, currentUserId }: { members: DocumentMember[]; currentUserId: string | null })`.

- [x] **Step 1: Write the failing tests** (bb2cb9b)

`editor-header.test.tsx` (every existing render gains `currentUserId={SESSION_USER.id}`; import `SESSION_USER` from `@/testing/opened-document`, `HOME_LINK_LABEL`, `memberLabel`):

```tsx
test('the home link opens the documents list', async () => {
  const { router } = renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Editor)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />, { route: documentPagePath(DOCUMENT_ID) });
  await userEvent.click(screen.getByRole('link', { name: HOME_LINK_LABEL }));
  expect(router.state.location.pathname).toBe(AppRoute.Documents);
});

test('members announce their presence and the current user is online at once', () => {
  const members = [
    { user: { id: SESSION_USER.id, name: 'Ada' }, role: DocumentRole.Owner, online: false },
    { user: { id: 'user-2', name: 'Bruno' }, role: DocumentRole.Editor, online: false },
    { user: { id: 'user-3', name: 'Carla' }, role: DocumentRole.Editor, online: true },
  ];
  renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Owner)} members={members} currentUserId={SESSION_USER.id} onDownload={onDownload} />);
  expect(screen.getByText(memberLabel({ name: 'Ada', isOnline: true }))).toBeInTheDocument();
  expect(screen.getByText(memberLabel({ name: 'Carla', isOnline: true }))).toBeInTheDocument();
  expect(screen.getByText(memberLabel({ name: 'Bruno', isOnline: false }))).toBeInTheDocument();
  expect(memberLabel({ name: 'Carla', isOnline: true })).toBe('Carla, online');
});
```

Replace the existing "an online member renders a dot" test with the one above.

`document-page.test.tsx` (import `HOME_LINK_LABEL`, `LOADING_DOCUMENT_MESSAGE`, `pageTitle`):

```tsx
test('the header stays while the document opens', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return new Response(JSON.stringify({ user: SESSION_USER }));
    return new Promise<Response>(() => undefined);
  });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  expect(await screen.findByRole('link', { name: HOME_LINK_LABEL })).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent(LOADING_DOCUMENT_MESSAGE);
});

test('the browser tab names the open document', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(document.title).toBe(pageTitle(DOCUMENT_TITLE)));
});
```

Inert stubs: `HOME_LINK_LABEL` and `memberLabel` (returning `name`) exported from `editor-copy.ts`; `EditorHeader` and `Members` accept and ignore `currentUserId`.

- [x] **Step 2: Run the tests to verify they fail** (bb2cb9b, 4 red on their assertions)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features/editor/editor-header.test.tsx src/features/editor/document-page.test.tsx`
Expected: FAIL on `Unable to find role="link"`, `Unable to find an element with the text: Ada, online`, and `expected 'SuperDoc History' to be 'Plan · SuperDoc History'`.

- [x] **Step 3: Commit the red tests** (bb2cb9b)

```bash
git add apps/web/src/features/editor/editor-header.test.tsx apps/web/src/features/editor/document-page.test.tsx apps/web/src/features/editor/editor-copy.ts apps/web/src/features/editor/editor-header.tsx apps/web/src/features/editor/members.tsx
git commit -m "test(web): pin the home link, presence labels and the opening header"
```

- [x] **Step 4: Implement** (64dfd80)

`editor-copy.ts`:

```ts
import { APP_NAME } from '@/lib/app-copy';

export const HOME_LINK_LABEL = `${APP_NAME}, back to documents`;

export function memberLabel({ name, isOnline }: { name: string; isOnline: boolean }): string {
  if (!isOnline) return name;
  return `${name}, ${ONLINE_LABEL}`;
}
```

`home-link.tsx`:

```tsx
import { AppRoute } from '@superdoc-history/types';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/app-copy';
import { HOME_LINK_LABEL } from './editor-copy';

export function HomeLink() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={AppRoute.Documents} aria-label={HOME_LINK_LABEL}>
        <ArrowLeft />
        <span className="hidden sm:inline">{APP_NAME}</span>
      </Link>
    </Button>
  );
}
```

`members.tsx`:

```tsx
export function Members({ members, currentUserId }: { members: DocumentMember[]; currentUserId: string | null }) {
  return (
    <ul className="flex items-center gap-1">
      {members.map((member) => {
        const isOnline = member.online || member.user.id === currentUserId;
        return (
          <li key={member.user.id} title={member.user.name} className="relative flex size-8 items-center justify-center rounded-full bg-muted text-xs font-medium">
            <span aria-hidden>{initialsOf(member.user.name)}</span>
            <span className="sr-only">{memberLabel({ name: member.user.name, isOnline })}</span>
            {isOnline && <span aria-hidden className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-background bg-online" />}
          </li>
        );
      })}
    </ul>
  );
}
```

`editor-header.tsx`: `EditorHeader` takes `currentUserId`, renders `<HomeLink />` first in the header and passes `currentUserId` to `Members`.

`document-page.tsx`: drop the `SessionSkeleton` import; add

```tsx
function OpeningDocument() {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <HomeLink />
        <Skeleton className="h-9 w-full max-w-sm" />
      </header>
      <p role="status" className="p-4 text-sm text-muted-foreground">{LOADING_DOCUMENT_MESSAGE}</p>
    </div>
  );
}
```

call `useDocumentTitle(opened ? opened.document.title : null);` with the other hooks (before the early returns), replace `if (!opened) return <SessionSkeleton />;` with `if (!opened) return <OpeningDocument />;`, and pass `currentUserId={user ? user.id : null}` to `EditorHeader`.

- [x] **Step 5: Run the tests** (64dfd80, web 223/223)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features/editor && pnpm typecheck`
Expected: PASS.

- [x] **Step 6: Commit** (64dfd80)

```bash
git add apps/web/src/features/editor/home-link.tsx apps/web/src/features/editor/editor-header.tsx apps/web/src/features/editor/members.tsx apps/web/src/features/editor/document-page.tsx apps/web/src/features/editor/editor-copy.ts
git commit -m "fix(web): link the editor back home, name the tab and announce presence"
```

---

### Task 6: Documents page (G2) — P2-3, P2-4, P2-5 (documents page), P2-6 (documents page), P2-7, P2-8

**Files:**
- Create: `apps/web/src/features/documents/document-columns.ts`
- Create: `apps/web/src/features/documents/use-create-document.ts`
- Create: `apps/web/src/features/documents/document-list-skeleton.tsx`
- Modify: `apps/web/src/features/documents/document-table.tsx`
- Modify: `apps/web/src/features/documents/documents-page.tsx`
- Modify: `apps/web/src/features/documents/new-document-button.tsx`
- Modify: `apps/web/src/features/documents/upload-dialog.tsx`
- Modify: `apps/web/src/features/documents/documents-copy.ts`
- Test: `apps/web/src/features/documents/documents-page.test.tsx`, `apps/web/src/features/documents/upload-dialog.test.tsx`

**Interfaces:**
- Consumes: `APP_NAME`, `useDocumentTitle`, `pageTitle`, `Skeleton` from Task 1; `formatTimestamp` from lane B.
- Produces (Task 7 extends `useCreateDocument`):
  - `enum DocumentListKind { Mine = 'mine', Shared = 'shared' }`, `enum DocumentColumn { Title = 'title', Owner = 'owner', Updated = 'updated', Access = 'access' }`, `COLUMNS_BY_KIND`, `NARROW_HIDDEN_COLUMNS` in `document-columns.ts`.
  - `useCreateDocument(): UseMutationResult<DocumentSummary, Error, void>`.
  - `NewDocumentButton({ isPending, onCreate }: { isPending: boolean; onCreate: () => void })`.
  - `DocumentTable({ documents, emptyMessage, kind }: { documents: DocumentSummary[]; emptyMessage: string; kind: DocumentListKind })`.
  - Copy: `ROLE_LABELS`, `COLUMN_LABELS`, `DOCUMENTS_HEADING`, `LOADING_DOCUMENTS_LABEL`, `UPLOADING_MESSAGE` (`COLUMN_HEADERS` is deleted).

- [x] **Step 1: Write the failing tests** (d06cb61)

`documents-page.test.tsx` (import `COLUMN_LABELS`, `DOCUMENTS_HEADING`, `LOADING_DOCUMENTS_LABEL`, `ROLE_LABELS`, `CREATE_ERROR_MESSAGE`, `COLUMNS_BY_KIND`, `DocumentListKind`, `pageTitle`, `APP_NAME`):

```tsx
const SHARED_DOCUMENT: DocumentSummary = { id: 'doc-3', title: 'Hiring plan', owner: { id: 'user-2', name: 'Bruno' }, updatedAt: Date.UTC(2026, 9, 16, 13, 0), role: DocumentRole.Editor };

function headersOf(table: HTMLElement): (string | null)[] {
  return within(table).getAllByRole('columnheader').map((header) => header.textContent);
}

test('the page names the app and the list, and the tab says Documents', async () => {
  mockApi({ mine: [], shared: [] });
  renderWithProviders(<DocumentsPage />);
  expect(screen.getByText(APP_NAME)).toBeVisible();
  expect(screen.getByRole('heading', { level: 1, name: DOCUMENTS_HEADING })).toBeVisible();
  await waitFor(() => expect(document.title).toBe(pageTitle(DOCUMENTS_HEADING)));
});

test('Mine shows title and date, Shared adds the owner and a readable access label', async () => {
  mockApi({ mine: [OWNED_DOCUMENT], shared: [SHARED_DOCUMENT] });
  renderWithProviders(<DocumentsPage />);
  const [mineTable, sharedTable] = await screen.findAllByRole('table');
  expect(headersOf(mineTable!)).toEqual(COLUMNS_BY_KIND[DocumentListKind.Mine].map((column) => COLUMN_LABELS[column]));
  expect(headersOf(sharedTable!)).toEqual(COLUMNS_BY_KIND[DocumentListKind.Shared].map((column) => COLUMN_LABELS[column]));
  expect(within(sharedTable!).getByText(ROLE_LABELS[DocumentRole.Editor])).toBeInTheDocument();
  expect(within(sharedTable!).queryByText(DocumentRole.Editor)).not.toBeInTheDocument();
});

test('the lists show skeleton rows while they load, under the heading', () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    if (input === ApiPath.Me) return new Response(JSON.stringify({ user: SESSION_USER }));
    return new Promise<Response>(() => undefined);
  });
  renderWithProviders(<DocumentsPage />);
  expect(screen.getByRole('heading', { level: 1, name: DOCUMENTS_HEADING })).toBeVisible();
  expect(screen.getByRole('status', { name: LOADING_DOCUMENTS_LABEL })).toBeInTheDocument();
});

test('a failed New document shows its alert under the heading, outside the button row', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    if (input === ApiPath.Me) return new Response(JSON.stringify({ user: SESSION_USER }));
    if (init?.method === HttpMethod.Post) return new Response(null, { status: HttpStatus.InternalServerError });
    return new Response(JSON.stringify({ mine: [], shared: [] }));
  });
  renderWithProviders(<DocumentsPage />);
  const button = await screen.findByRole('button', { name: NEW_DOCUMENT_LABEL });
  await userEvent.click(button);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(CREATE_ERROR_MESSAGE);
  expect(button.parentElement).not.toContainElement(alert);
});
```

Rewrite the existing "a row shows the title, owner, formatted date and role" test for the Mine columns (title and date) and delete the `COLUMN_HEADERS` assertion it replaces. If `HttpStatus.InternalServerError` does not exist in `libs/types`, use the closest existing member (read `libs/types/src/http.ts`).

`upload-dialog.test.tsx` (import `UPLOADING_MESSAGE`):

```tsx
test('while the upload runs the input is disabled and the wait is announced', async () => {
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => undefined));
  renderWithProviders(<UploadDialog />);
  await chooseFile(docxFile({ name: 'plan.docx', size: 10 }));
  expect(await screen.findByRole('status')).toHaveTextContent(UPLOADING_MESSAGE);
  expect(screen.getByLabelText(FILE_INPUT_LABEL)).toBeDisabled();
});
```

Inert stubs: the new copy constants and enums exist; `COLUMN_LABELS` and `COLUMNS_BY_KIND` have their final values; the components ignore them.

- [x] **Step 2: Run the tests to verify they fail** (d06cb61, 5 red on their assertions)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features/documents`
Expected: FAIL on the missing app name and h1, headers `['Title','Owner','Updated','My role']` for Mine, the raw `editor` badge, no status while loading, the alert inside the button row, and no "Uploading…" status.

- [x] **Step 3: Commit the red tests** (d06cb61)

```bash
git add apps/web/src/features/documents/documents-page.test.tsx apps/web/src/features/documents/upload-dialog.test.tsx apps/web/src/features/documents/documents-copy.ts apps/web/src/features/documents/document-columns.ts
git commit -m "test(web): pin the readable documents list, its loading rows and the upload wait"
```

- [x] **Step 4: Implement the columns and the table** (3cc560f)

`document-columns.ts`:

```ts
export enum DocumentListKind {
  Mine = 'mine',
  Shared = 'shared',
}

export enum DocumentColumn {
  Title = 'title',
  Owner = 'owner',
  Updated = 'updated',
  Access = 'access',
}

export const COLUMNS_BY_KIND: Record<DocumentListKind, DocumentColumn[]> = {
  [DocumentListKind.Mine]: [DocumentColumn.Title, DocumentColumn.Updated],
  [DocumentListKind.Shared]: [DocumentColumn.Title, DocumentColumn.Owner, DocumentColumn.Updated, DocumentColumn.Access],
};

export const NARROW_HIDDEN_COLUMNS: Record<DocumentListKind, DocumentColumn[]> = {
  [DocumentListKind.Mine]: [],
  [DocumentListKind.Shared]: [DocumentColumn.Owner, DocumentColumn.Updated],
};
```

`documents-copy.ts` (delete `COLUMN_HEADERS`):

```ts
import { DocumentRole, MAX_UPLOAD_MEGABYTES } from '@superdoc-history/types';
import { DocumentColumn } from './document-columns';

export const DOCUMENTS_HEADING = 'Documents';
export const LOADING_DOCUMENTS_LABEL = 'Loading documents';
export const UPLOADING_MESSAGE = 'Uploading…';

export const ROLE_LABELS: Record<DocumentRole, string> = {
  [DocumentRole.Owner]: 'Owner',
  [DocumentRole.Editor]: 'Can edit',
  [DocumentRole.Reader]: 'Can view',
};

export const COLUMN_LABELS: Record<DocumentColumn, string> = {
  [DocumentColumn.Title]: 'Title',
  [DocumentColumn.Owner]: 'Owner',
  [DocumentColumn.Updated]: 'Updated',
  [DocumentColumn.Access]: 'Access',
};
```

`document-table.tsx`:

```tsx
import { documentPagePath, type DocumentSummary } from '@superdoc-history/types';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatTimestamp } from '@/lib/format-date-time';
import { cn } from '@/lib/utils';
import { COLUMNS_BY_KIND, DocumentColumn, type DocumentListKind, NARROW_HIDDEN_COLUMNS } from './document-columns';
import { COLUMN_LABELS, ROLE_LABELS } from './documents-copy';

const NARROW_HIDDEN_CLASS = 'hidden sm:table-cell';

const CELL_CONTENT: Record<DocumentColumn, (document: DocumentSummary) => ReactNode> = {
  [DocumentColumn.Title]: (document) => (
    <Link to={documentPagePath(document.id)} className="font-medium hover:underline">
      {document.title}
    </Link>
  ),
  [DocumentColumn.Owner]: (document) => document.owner.name,
  [DocumentColumn.Updated]: (document) => formatTimestamp(document.updatedAt),
  [DocumentColumn.Access]: (document) => <Badge variant="secondary">{ROLE_LABELS[document.role]}</Badge>,
};

type DocumentTableProps = { documents: DocumentSummary[]; emptyMessage: string; kind: DocumentListKind };

export function DocumentTable({ documents, emptyMessage, kind }: DocumentTableProps) {
  const columns = COLUMNS_BY_KIND[kind];
  const hiddenWhenNarrow = NARROW_HIDDEN_COLUMNS[kind];
  if (documents.length === 0) return <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">{emptyMessage}</p>;

  function columnClass(column: DocumentColumn): string {
    return cn(hiddenWhenNarrow.includes(column) && NARROW_HIDDEN_CLASS);
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column} className={columnClass(column)}>
                {COLUMN_LABELS[column]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((document) => (
            <TableRow key={document.id}>
              {columns.map((column) => (
                <TableCell key={column} className={columnClass(column)}>
                  {CELL_CONTENT[column](document)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [x] **Step 5: Implement the page, the create hook and the upload wait** (3cc560f)

`use-create-document.ts`:

```ts
import { documentPagePath, UNTITLED_DOCUMENT_TITLE, type DocumentSummary } from '@superdoc-history/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { createBlankDocument, DOCUMENTS_QUERY_KEY } from './documents-api';

export function useCreateDocument(): UseMutationResult<DocumentSummary, Error, void> {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => createBlankDocument(UNTITLED_DOCUMENT_TITLE),
    onSuccess: async (document) => {
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
      await navigate(documentPagePath(document.id));
    },
  });
}
```

`new-document-button.tsx`:

```tsx
import { Button } from '@/components/ui/button';
import { NEW_DOCUMENT_LABEL } from './documents-copy';

export function NewDocumentButton({ isPending, onCreate }: { isPending: boolean; onCreate: () => void }) {
  return (
    <Button disabled={isPending} onClick={onCreate}>
      {NEW_DOCUMENT_LABEL}
    </Button>
  );
}
```

`document-list-skeleton.tsx`:

```tsx
import { Skeleton } from '@/components/ui/skeleton';
import { LOADING_DOCUMENTS_LABEL } from './documents-copy';

const SKELETON_ROWS = 3;

export function DocumentListSkeleton() {
  return (
    <div role="status" aria-label={LOADING_DOCUMENTS_LABEL} className="space-y-2">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}
```

`documents-page.tsx`:

```tsx
export function DocumentsPage() {
  const { user } = useSession();
  const { data, isError, isPending } = useDocuments();
  const createDocument = useCreateDocument();
  useDocumentTitle(DOCUMENTS_HEADING);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <span className="font-semibold">{APP_NAME}</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{user?.name}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-8 p-6">
        <h1 className="text-2xl font-semibold">{DOCUMENTS_HEADING}</h1>
        {isError && <p role="alert" className="text-sm text-destructive">{DOCUMENTS_LOAD_ERROR_MESSAGE}</p>}
        {isPending && <DocumentListSkeleton />}
        {data && (
          <>
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{MINE_HEADING}</h2>
                <div className="flex gap-2">
                  <UploadDialog />
                  <NewDocumentButton isPending={createDocument.isPending} onCreate={() => createDocument.mutate()} />
                </div>
              </div>
              {createDocument.isError && <p role="alert" className="text-sm text-destructive">{CREATE_ERROR_MESSAGE}</p>}
              <DocumentTable documents={data.mine} emptyMessage={MINE_EMPTY_MESSAGE} kind={DocumentListKind.Mine} />
            </section>
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">{SHARED_HEADING}</h2>
              <DocumentTable documents={data.shared} emptyMessage={SHARED_EMPTY_MESSAGE} kind={DocumentListKind.Shared} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
```

`isPending` is TanStack's "no data yet"; when the request fails `isError` is true and `isPending` is false, so the skeleton never sits beside the error.

`upload-dialog.tsx`: read `isPending` from `useMutation`, give the input `disabled={isPending}`, and render `{isPending && <p role="status" className="text-sm text-muted-foreground">{UPLOADING_MESSAGE}</p>}` under it.

- [x] **Step 6: Run the tests** (3cc560f, web 228/228, no COLUMN_HEADERS left)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features/documents && pnpm typecheck`
Expected: PASS. `rg -n "COLUMN_HEADERS" apps e2e` prints nothing.

- [x] **Step 7: Commit** (3cc560f)

```bash
git add apps/web/src/features/documents/document-columns.ts apps/web/src/features/documents/use-create-document.ts apps/web/src/features/documents/document-list-skeleton.tsx apps/web/src/features/documents/document-table.tsx apps/web/src/features/documents/documents-page.tsx apps/web/src/features/documents/new-document-button.tsx apps/web/src/features/documents/upload-dialog.tsx apps/web/src/features/documents/documents-copy.ts
git commit -m "fix(web): make the documents list readable on a phone and show its waits"
```

---

### Task 7: Mobile header and editor surface (G2) — P2-2 (with P3-5), P2-13, P3-11

**SuperDoc zoom check (done while planning):** SuperDoc 2.23.0 exposes a zoom option. `Config.zoom?: SuperDocZoomConfig` with `mode?: 'manual' | 'fit-width'`, `initial?: number` and `fitWidth?: { min?, max?, padding? }` (`apps/web/node_modules/superdoc/dist/superdoc/src/core/types/index.d.ts`, `SuperDocZoomConfig`), and on the instance `setZoom(percent)`, `setZoomMode(mode)`, `getZoomState()` (`.../core/SuperDoc.d.ts`). `fitWidth.max` defaults to 100, so fitting never enlarges the page. P3-11 is implemented below.

**Files:**
- Create: `apps/web/src/features/editor/superdoc-zoom.ts`
- Test: `apps/web/src/features/editor/superdoc-zoom.test.ts`
- Create: `apps/web/src/features/documents/new-document-state.ts`
- Modify: `apps/web/src/features/documents/use-create-document.ts` (navigate with state)
- Modify: `apps/web/src/features/editor/superdoc-editor.tsx`
- Modify: `apps/web/src/features/editor/document-page.tsx`
- Modify: `apps/web/src/features/editor/editor-header.tsx`
- Modify: `apps/web/src/features/editor/share-dialog.tsx` (trigger only)
- Modify: `apps/web/src/features/editor/editor-copy.ts` (`MORE_ACTIONS_LABEL`)
- Modify: `apps/web/src/features/versions/version-viewer.tsx` (zoom)
- Modify: `e2e/documents.spec.ts:123` (Delete through the menu)
- Test: `apps/web/src/features/editor/editor-header.test.tsx`, `apps/web/src/features/editor/document-page.test.tsx`

**Interfaces:**
- Consumes: `DropdownMenu*` from Task 1, `renderWithProviders(…, { state })` from Task 1, `useCreateDocument` from Task 6.
- Produces:
  - `enum ZoomMode { Manual = 'manual', FitWidth = 'fit-width' }`, `NARROW_VIEWPORT_QUERY`, `FULL_ZOOM_PERCENT`, `initialZoomMode(): ZoomMode`, `followViewportZoom(superdoc: SuperDoc): () => void`.
  - `NEW_DOCUMENT_STATE: NewDocumentState`, `isNewDocumentState(state: unknown): state is NewDocumentState`.
  - `SuperDocEditor` gains `focusOnReady: boolean`.
  - `MORE_ACTIONS_LABEL`; the delete dialog opens from the "More actions" menu (Task 8 adds Cancel to it).

- [x] **Step 1: Write the failing tests** (0746356)

`superdoc-zoom.test.ts`:

```ts
import type { SuperDoc } from 'superdoc';
import { afterEach, expect, test, vi } from 'vitest';
import { followViewportZoom, FULL_ZOOM_PERCENT, initialZoomMode, NARROW_VIEWPORT_QUERY, ZoomMode } from './superdoc-zoom';

type ChangeListener = (event: MediaQueryListEvent) => void;

function viewportDouble(matches: boolean) {
  const listeners = new Set<ChangeListener>();
  const query = {
    matches,
    addEventListener: (_type: string, listener: ChangeListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: ChangeListener) => listeners.delete(listener),
  } as unknown as MediaQueryList;
  const matchMedia = vi.spyOn(window, 'matchMedia').mockReturnValue(query);
  function change(nextMatches: boolean): void {
    listeners.forEach((listener) => listener({ matches: nextMatches } as MediaQueryListEvent));
  }
  return { matchMedia, listeners, change };
}

function superdocDouble() {
  return { setZoom: vi.fn(), setZoomMode: vi.fn() };
}

afterEach(() => vi.restoreAllMocks());

test('a narrow viewport starts fitted to the width and a wide one at full size', () => {
  const { matchMedia } = viewportDouble(true);
  expect(initialZoomMode()).toBe(ZoomMode.FitWidth);
  expect(matchMedia).toHaveBeenCalledWith(NARROW_VIEWPORT_QUERY);
  viewportDouble(false);
  expect(initialZoomMode()).toBe(ZoomMode.Manual);
});

test('crossing the breakpoint switches the zoom both ways and unsubscribing stops it', () => {
  const viewport = viewportDouble(false);
  const superdoc = superdocDouble();
  const stop = followViewportZoom(superdoc as unknown as SuperDoc);
  viewport.change(true);
  expect(superdoc.setZoomMode).toHaveBeenCalledWith(ZoomMode.FitWidth);
  viewport.change(false);
  expect(superdoc.setZoom).toHaveBeenCalledWith(FULL_ZOOM_PERCENT);
  stop();
  expect(viewport.listeners.size).toBe(0);
});
```

`document-page.test.tsx`: extend the hoisted SuperDoc stub's config type to `{ onException: …; onReady: (payload: { superdoc: { focus: () => void } }) => void; zoom: { mode: string } }`, and add (import `NEW_DOCUMENT_STATE`, `ZoomMode`):

```tsx
function constructedConfig(): SuperDocConfig {
  const firstCall = SuperDoc.mock.calls.at(0);
  if (!firstCall) throw new Error('SuperDoc was not constructed');
  return firstCall[0];
}

test('a document created with New document gets the caret once the editor is ready', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID), state: NEW_DOCUMENT_STATE });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const focus = vi.fn();
  constructedConfig().onReady({ superdoc: { focus } });
  expect(focus).toHaveBeenCalledTimes(1);
});

test('an existing document does not take the focus', async () => {
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledTimes(1));
  const focus = vi.fn();
  constructedConfig().onReady({ superdoc: { focus } });
  expect(focus).not.toHaveBeenCalled();
});

test('below the large breakpoint the page fits the width', async () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList);
  mockDocumentApi({ opened: openedAs(DocumentRole.Owner) });
  renderWithProviders(<DocumentPage />, { route: documentPagePath(DOCUMENT_ID) });
  await waitFor(() => expect(SuperDoc).toHaveBeenCalledWith(expect.objectContaining({ zoom: { mode: ZoomMode.FitWidth } })));
});
```

`editor-header.test.tsx` (import `MORE_ACTIONS_LABEL`, `SHARE_LABEL`): add

```tsx
async function openDeleteDialog(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: MORE_ACTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: DELETE_LABEL }));
}

test('Delete lives in the More actions menu, Download and Share keep their names as icons', async () => {
  renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Owner)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />);
  expect(screen.queryByRole('button', { name: DELETE_LABEL })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: DOWNLOAD_LABEL })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: SHARE_LABEL })).toBeInTheDocument();
  await openDeleteDialog();
  expect(await screen.findByRole('button', { name: DELETE_CONFIRM_LABEL })).toBeInTheDocument();
});

test('a reader has no More actions menu', () => {
  renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Reader)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />);
  expect(screen.queryByRole('button', { name: MORE_ACTIONS_LABEL })).not.toBeInTheDocument();
});
```

Change the two existing delete tests to call `openDeleteDialog()` instead of clicking `DELETE_LABEL`. If Radix ignores the user-event click on the trigger in jsdom, open it with `screen.getByRole('button', { name: MORE_ACTIONS_LABEL }).focus()` then `userEvent.keyboard('{Enter}')` inside `openDeleteDialog`.

Inert stubs: `superdoc-zoom.ts` exports the enum, constants, `initialZoomMode` returning `ZoomMode.Manual` and `followViewportZoom` returning a no-op; `new-document-state.ts` complete (it is data, see Step 4); `MORE_ACTIONS_LABEL` exported.

- [x] **Step 2: Run the tests to verify they fail** (0746356, 8 red on their assertions)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features/editor`
Expected: FAIL on `expected 'manual' to be 'fit-width'`, `setZoomMode` never called, `onReady is not a function` (or `focus` not called), the missing `zoom` key, the Delete button still present, and no "More actions" button.

- [x] **Step 3: Commit the red tests** (0746356)

```bash
git add apps/web/src/features/editor/superdoc-zoom.ts apps/web/src/features/editor/superdoc-zoom.test.ts apps/web/src/features/documents/new-document-state.ts apps/web/src/features/editor/document-page.test.tsx apps/web/src/features/editor/editor-header.test.tsx apps/web/src/features/editor/editor-copy.ts
git commit -m "test(web): pin the phone header, the fitted page and the new document caret"
```

- [x] **Step 4: Implement zoom and the new document state** (4c8e966)

`superdoc-zoom.ts`:

```ts
import type { SuperDoc } from 'superdoc';

export enum ZoomMode {
  Manual = 'manual',
  FitWidth = 'fit-width',
}

export const NARROW_VIEWPORT_QUERY = '(width < 64rem)';
export const FULL_ZOOM_PERCENT = 100;

export function initialZoomMode(): ZoomMode {
  if (window.matchMedia(NARROW_VIEWPORT_QUERY).matches) return ZoomMode.FitWidth;
  return ZoomMode.Manual;
}

export function followViewportZoom(superdoc: SuperDoc): () => void {
  const narrowViewport = window.matchMedia(NARROW_VIEWPORT_QUERY);
  function applyZoom(event: MediaQueryListEvent): void {
    if (event.matches) {
      superdoc.setZoomMode(ZoomMode.FitWidth);
      return;
    }
    superdoc.setZoom(FULL_ZOOM_PERCENT);
  }
  narrowViewport.addEventListener('change', applyZoom);
  return () => narrowViewport.removeEventListener('change', applyZoom);
}
```

`64rem` is Tailwind 4's `lg`. `new-document-state.ts`:

```ts
export type NewDocumentState = { isNewDocument: true };

export const NEW_DOCUMENT_STATE: NewDocumentState = { isNewDocument: true };

export function isNewDocumentState(state: unknown): state is NewDocumentState {
  return typeof state === 'object' && state !== null && 'isNewDocument' in state;
}
```

`use-create-document.ts`: `await navigate(documentPagePath(document.id), { state: NEW_DOCUMENT_STATE });`.

- [x] **Step 5: Implement the editor surface** (4c8e966)

`superdoc-editor.tsx`: add `focusOnReady: boolean` to the props (and to the effect's dependency list), then in the effect:

```tsx
const superdoc = new SuperDoc({
  selector: container,
  documentMode: role === DocumentRole.Reader ? DocumentMode.Viewing : DocumentMode.Editing,
  documents: [...unchanged],
  user: { id: user.id, name: user.name, email: user.email },
  zoom: { mode: initialZoomMode() },
  onReady: ({ superdoc: ready }) => {
    if (!focusOnReady) return;
    ready.focus();
  },
  onException: () => setHasFailed(true),
});
superdocRef.current = superdoc;
const stopFollowingViewport = followViewportZoom(superdoc);
return () => {
  stopFollowingViewport();
  superdocRef.current = null;
  superdoc.destroy();
};
```

The container gets the page backdrop: `className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto bg-muted [&_.superdoc-page]:bg-background [&_.superdoc-page]:shadow-sm"`. `superdoc-page` is SuperDoc's public page class (`node_modules/superdoc/dist/layout-engine/dom-contract/src/class-names.d.ts`, `DOM_CLASS_NAMES.PAGE`).

`document-page.tsx`: import `useLocation` from `react-router` and `isNewDocumentState` from `@/features/documents/new-document-state`, add `const location = useLocation();` with the other hooks, and pass `focusOnReady={isNewDocumentState(location.state)}` to `SuperDocEditor`.

`features/versions/version-viewer.tsx`: add `zoom: { mode: initialZoomMode() }` to its SuperDoc config, and `const stopFollowingViewport = followViewportZoom(superdoc);` with `stopFollowingViewport()` in its cleanup before `superdoc.destroy()`.

- [x] **Step 6: Implement the header** (4c8e966)

`editor-copy.ts`: `export const MORE_ACTIONS_LABEL = 'More actions';`

`editor-header.tsx`:

```tsx
function DeleteDocumentDialog({ documentId, isOpen, onOpenChange }: DocumentIdentity & { isOpen: boolean; onOpenChange: (isOpen: boolean) => void }) {
  ...the mutation, unchanged
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        ...header, alert and footer unchanged
      </DialogContent>
    </Dialog>
  );
}

function DocumentActionsMenu({ documentId }: DocumentIdentity) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={MORE_ACTIONS_LABEL}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setIsDeleteOpen(true)}>
            {DELETE_LABEL}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteDocumentDialog documentId={documentId} isOpen={isDeleteOpen} onOpenChange={setIsDeleteOpen} />
    </>
  );
}
```

The header body:

```tsx
<header className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
  <HomeLink />
  {isReader ? <h1 className="min-w-0 flex-1 truncate font-medium">{document.title}</h1> : <TitleInput documentId={document.id} title={document.title} />}
  {isReader && <Badge variant="secondary">{READ_ONLY_BADGE_LABEL}</Badge>}
  <div className="ml-auto flex items-center gap-2">
    <Members members={members} currentUserId={currentUserId} />
    <Button variant="outline" aria-label={DOWNLOAD_LABEL} disabled={!onDownload} onClick={onDownload === null ? undefined : onDownload}>
      <Download />
      <span className="hidden sm:inline">{DOWNLOAD_LABEL}</span>
    </Button>
    {isOwner && <ShareDialog documentId={document.id} />}
    {isOwner && <DocumentActionsMenu documentId={document.id} />}
  </div>
</header>
```

`TitleInput`'s input class becomes `"min-w-0 flex-1 font-medium sm:max-w-sm"`, and its wrapper fragment stays. `share-dialog.tsx` trigger:

```tsx
<Button variant="outline" aria-label={SHARE_LABEL}>
  <Share2 />
  <span className="hidden sm:inline">{SHARE_LABEL}</span>
</Button>
```

`e2e/documents.spec.ts:123`: open the menu, then the item.

```ts
await ana.page.getByRole('button', { name: MORE_ACTIONS_LABEL }).click();
await ana.page.getByRole('menuitem', { name: DELETE_LABEL }).click();
await ana.page.getByRole('button', { name: DELETE_CONFIRM_LABEL }).click();
```

- [x] **Step 7: Run the tests** (4c8e966, web 235/235)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features && pnpm typecheck`
Expected: PASS.

- [x] **Step 8: Commit** (4c8e966)

```bash
git add apps/web/src/features/editor/superdoc-zoom.ts apps/web/src/features/editor/superdoc-editor.tsx apps/web/src/features/editor/document-page.tsx apps/web/src/features/editor/editor-header.tsx apps/web/src/features/editor/share-dialog.tsx apps/web/src/features/editor/editor-copy.ts apps/web/src/features/documents/use-create-document.ts apps/web/src/features/versions/version-viewer.tsx e2e/documents.spec.ts
git commit -m "fix(web): fit the page and the header on a phone and place the caret in a new document"
```

---

### Task 8: Dialogs (G2) — P2-9, P2-10

**Files:**
- Modify: `apps/web/src/features/editor/editor-header.tsx` (`DeleteDocumentDialog` footer)
- Modify: `apps/web/src/features/editor/share-dialog.tsx`
- Modify: `apps/web/src/features/editor/editor-copy.ts`
- Test: `apps/web/src/features/editor/editor-header.test.tsx`, `apps/web/src/features/editor/share-dialog.test.tsx`

**Interfaces:**
- Consumes: `openDeleteDialog` test helper and `DocumentActionsMenu` from Task 7; `Skeleton` from Task 1.
- Produces: `CANCEL_LABEL`, `RESET_LINK_LABEL` (replaces `ROTATE_LABEL`), `RESET_FAILED_MESSAGE` (replaces `ROTATE_FAILED_MESSAGE`), `COPY_FAILED_MESSAGE`, `LOADING_SHARE_LINKS_LABEL`, `COPIED_NOTICE_MS` (exported from `share-dialog.tsx`).

- [x] **Step 1: Write the failing tests** (bbcb0d8)

`editor-header.test.tsx` (import `CANCEL_LABEL`):

```tsx
test('Cancel closes the delete dialog, sends nothing and leaves the page clickable', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  renderWithProviders(<EditorHeader opened={openedAs(DocumentRole.Owner)} members={[]} currentUserId={SESSION_USER.id} onDownload={onDownload} />);
  await openDeleteDialog();
  await userEvent.click(await screen.findByRole('button', { name: CANCEL_LABEL }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(document.body.style.pointerEvents).not.toBe('none');
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_LABEL }));
  expect(onDownload).toHaveBeenCalledTimes(1);
});
```

`share-dialog.test.tsx` (rename `ROTATE_LABEL` → `RESET_LINK_LABEL`, `ROTATE_FAILED_MESSAGE` → `RESET_FAILED_MESSAGE` in the existing tests; import `act`, `COPY_FAILED_MESSAGE`, `LOADING_SHARE_LINKS_LABEL`, `SHARE_DIALOG_DESCRIPTION`, `COPIED_NOTICE_MS`):

```tsx
test('the dialog says resetting stops the old link', async () => {
  mockShareApi();
  await openDialog();
  expect(screen.getByText(SHARE_DIALOG_DESCRIPTION)).toHaveTextContent('stops the old one from working');
});

test('two placeholder rows show while the links load', async () => {
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => undefined));
  await openDialog();
  expect(screen.getByRole('status', { name: LOADING_SHARE_LINKS_LABEL })).toBeInTheDocument();
});

test('a refused clipboard selects the link and says how to copy it', async () => {
  mockShareApi();
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'));
  await openDialog();
  const readRow = await screen.findByRole('group', { name: SHARE_LINK_LABELS[ShareLinkRole.Read] });
  await user.click(within(readRow).getByRole('button', { name: COPY_LABEL }));
  expect(await within(readRow).findByRole('status')).toHaveTextContent(COPY_FAILED_MESSAGE);
  const input = within(readRow).getByDisplayValue(LINKS[ShareLinkRole.Read]) as HTMLInputElement;
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe(LINKS[ShareLinkRole.Read].length);
});

test('a missing clipboard falls back the same way', async () => {
  mockShareApi();
  const user = userEvent.setup();
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(() => {
    throw new TypeError('clipboard unavailable');
  });
  await openDialog();
  const readRow = await screen.findByRole('group', { name: SHARE_LINK_LABELS[ShareLinkRole.Read] });
  await user.click(within(readRow).getByRole('button', { name: COPY_LABEL }));
  expect(await within(readRow).findByRole('status')).toHaveTextContent(COPY_FAILED_MESSAGE);
});

test('Link copied clears after a few seconds', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mockShareApi();
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
  await openDialog();
  const readRow = await screen.findByRole('group', { name: SHARE_LINK_LABELS[ShareLinkRole.Read] });
  await user.click(within(readRow).getByRole('button', { name: COPY_LABEL }));
  expect(await within(readRow).findByText(LINK_COPIED_MESSAGE)).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(COPIED_NOTICE_MS));
  expect(within(readRow).queryByText(LINK_COPIED_MESSAGE)).not.toBeInTheDocument();
  vi.useRealTimers();
});
```

Inert stubs: the new copy constants and `COPIED_NOTICE_MS` exported; `RESET_LINK_LABEL` keeps the old value `'Rotate'` until Step 4.

- [x] **Step 2: Run the tests to verify they fail** (bbcb0d8, 6 red on their assertions)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features/editor/editor-header.test.tsx src/features/editor/share-dialog.test.tsx`
Expected: FAIL on `Unable to find role="button" and name "Cancel"`, the description without "stops the old one", no loading status, an unhandled rejection or no status after a refused copy, and "Link copied" still present.

- [x] **Step 3: Commit the red tests** (bbcb0d8)

```bash
git add apps/web/src/features/editor/editor-header.test.tsx apps/web/src/features/editor/share-dialog.test.tsx apps/web/src/features/editor/editor-copy.ts apps/web/src/features/editor/share-dialog.tsx
git commit -m "test(web): pin Cancel on delete and the share dialog's missing states"
```

- [x] **Step 4: Implement** (228197c)

`editor-copy.ts` (delete `ROTATE_LABEL` and `ROTATE_FAILED_MESSAGE`):

```ts
export const CANCEL_LABEL = 'Cancel';
export const RESET_LINK_LABEL = 'Reset link';
export const RESET_FAILED_MESSAGE = 'The link could not be reset.';
export const COPY_FAILED_MESSAGE = 'The link could not be copied. It is selected, so copy it with your keyboard.';
export const LOADING_SHARE_LINKS_LABEL = 'Loading links';
export const SHARE_DIALOG_DESCRIPTION = 'Anyone signed in with a link joins with that link’s access. Resetting a link stops the old one from working.';
```

`editor-header.tsx`, the delete footer (import `DialogClose`):

```tsx
<DialogFooter>
  <DialogClose asChild>
    <Button variant="outline">{CANCEL_LABEL}</Button>
  </DialogClose>
  <Button variant="destructive" disabled={isPending} onClick={() => mutate()}>
    {DELETE_CONFIRM_LABEL}
  </Button>
</DialogFooter>
```

`share-dialog.tsx`:

```tsx
export const COPIED_NOTICE_MS = 3 * SECOND_MS;

enum CopyState {
  Idle = 'idle',
  Copied = 'copied',
  Failed = 'failed',
}

function ShareLinkRow({ documentId, role, url }: ShareLinkRowProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [copyState, setCopyState] = useState(CopyState.Idle);
  const label = SHARE_LINK_LABELS[role];
  const { mutate: reset, isPending, isError } = useMutation({
    mutationFn: () => rotateShareLink({ documentId, role }),
    onSuccess: (links: ShareLinks) => {
      setCopyState(CopyState.Idle);
      queryClient.setQueryData(shareLinksQueryKey(documentId), links);
    },
  });

  useEffect(() => {
    if (copyState !== CopyState.Copied) return;
    const timer = window.setTimeout(() => setCopyState(CopyState.Idle), COPIED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState(CopyState.Copied);
    } catch {
      inputRef.current?.select();
      setCopyState(CopyState.Failed);
    }
  }

  return (
    <div role="group" aria-label={label} className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div className="flex gap-2">
        <Input ref={inputRef} readOnly value={url} aria-label={`${label} address`} />
        <Button variant="outline" onClick={copy}>
          {COPY_LABEL}
        </Button>
        <Button variant="outline" disabled={isPending} aria-busy={isPending} onClick={() => reset()}>
          {RESET_LINK_LABEL}
        </Button>
      </div>
      {isError && <p role="alert" className="text-sm text-destructive">{RESET_FAILED_MESSAGE}</p>}
      {copyState === CopyState.Copied && <p role="status" className="text-sm text-muted-foreground">{LINK_COPIED_MESSAGE}</p>}
      {copyState === CopyState.Failed && <p role="status" className="text-sm text-muted-foreground">{COPY_FAILED_MESSAGE}</p>}
    </div>
  );
}
```

The Reset link button is disabled only while its own request runs, and `aria-busy` announces that wait. In `ShareDialog`, before the rows:

```tsx
{!data && (
  <div role="status" aria-label={LOADING_SHARE_LINKS_LABEL} className="space-y-4">
    {SHARE_ROLES.map((role) => (
      <Skeleton key={role} className="h-16 w-full" />
    ))}
  </div>
)}
```

If the shadcn `Input` in this repo does not forward `ref` (React 19 passes `ref` as a prop to function components, so it does), confirm with `pnpm typecheck`.

- [x] **Step 5: Run the tests** (228197c, web 241/241, no ROTATE_ constants left)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/features/editor && pnpm typecheck`
Expected: PASS. `rg -n "ROTATE_LABEL|ROTATE_FAILED_MESSAGE" apps e2e` prints nothing.

- [x] **Step 6: Commit** (228197c)

```bash
git add apps/web/src/features/editor/editor-header.tsx apps/web/src/features/editor/share-dialog.tsx apps/web/src/features/editor/editor-copy.ts
git commit -m "fix(web): add Cancel to delete and explain, load and fall back in the share dialog"
```

---

### Task 9: Auth and copy sweep (G2) — P2-5 (auth pages), P2-17, P2-18, P3-3

Runs after G1 is merged into the lane branch (its test reads the timeline sentences Task 4 fixed).

**Files:**
- Modify: `apps/web/src/features/auth/auth-copy.ts`
- Modify: `apps/web/src/features/auth/sign-in-page.tsx`, `apps/web/src/features/auth/sign-up-page.tsx`
- Modify: `apps/web/src/features/sharing/share-landing-page.tsx:28`
- Modify: `apps/web/src/features/editor/editor-copy.ts` (`LOADING_DOCUMENT_MESSAGE`, `SHARE_OPENING_MESSAGE`)
- Modify: `libs/types/src/documents.ts:13,18`, `libs/types/src/timeline.ts:20-21`
- Create: `apps/web/src/lib/copy-rules.test.ts`
- Test: `apps/web/src/features/auth/sign-in-page.test.tsx`, `apps/web/src/features/sharing/share-landing-page.test.tsx`

**Interfaces:**
- Consumes: `useDocumentTitle`, `pageTitle` from Task 1.
- Produces: `SIGN_UP_HEADING`, `SIGN_IN_DESCRIPTION`, `SIGN_UP_DESCRIPTION`, `NO_ACCOUNT_PROMPT`, `HAVE_ACCOUNT_PROMPT`, `NAME_FIELD_LABEL`, `EMAIL_FIELD_LABEL`, `PASSWORD_FIELD_LABEL` in `auth-copy.ts`.

- [x] **Step 1: Write the failing tests** (4b65836)

`apps/web/src/lib/copy-rules.test.ts`:

```ts
import * as types from '@superdoc-history/types';
import { expect, test } from 'vitest';
import * as authCopy from '@/features/auth/auth-copy';
import * as documentsCopy from '@/features/documents/documents-copy';
import * as editorCopy from '@/features/editor/editor-copy';
import * as timelineCopy from '@/features/timeline/timeline-copy';
import * as appCopy from './app-copy';

const THREE_DOTS = '...';
const PERIOD = '.';
const COPY_MODULES: Record<string, unknown>[] = [authCopy, documentsCopy, editorCopy, timelineCopy, appCopy, types];
const SENTENCES = [
  types.INVALID_SHARE_LINK_MESSAGE,
  types.DOCUMENT_UNAVAILABLE_MESSAGE,
  types.HISTORY_CATCHING_UP_MESSAGE,
  types.NO_MATCHING_EDITS_MESSAGE,
  timelineCopy.SUMMARY_UP_TO_DATE_MESSAGE,
  timelineCopy.SUMMARIES_UNAVAILABLE_MESSAGE,
];

function copyStrings(module: Record<string, unknown>): string[] {
  return Object.values(module).filter((value): value is string => typeof value === 'string');
}

test('no copy writes an ellipsis as three dots', () => {
  expect(COPY_MODULES.flatMap(copyStrings).filter((text) => text.includes(THREE_DOTS))).toEqual([]);
});

test.each(SENTENCES)('the sentence "%s" ends with a period', (sentence) => {
  expect(sentence.endsWith(PERIOD)).toBe(true);
});
```

`sign-in-page.test.tsx` (import `pageTitle`, `NO_ACCOUNT_PROMPT`, `SIGN_UP_LABEL`):

```tsx
test('the sign-in page names its tab and links to sign-up from copy', async () => {
  renderSignInPage();
  expect(screen.getByText(NO_ACCOUNT_PROMPT, { exact: false })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: SIGN_UP_LABEL })).toBeInTheDocument();
  await waitFor(() => expect(document.title).toBe(pageTitle(SIGN_IN_LABEL)));
});
```

`share-landing-page.test.tsx`:

```tsx
test('the opening state is centred like the failure state', () => {
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => undefined));
  renderWithProviders(<ShareLandingPage />, { route: SHARE_ROUTE });
  const opening = screen.getByRole('status');
  expect(opening).toHaveTextContent(SHARE_OPENING_MESSAGE);
  expect(screen.getByRole('main')).toContainElement(opening);
});
```

Inert stubs: the new auth copy constants exist. If the three-dots test lists a string that is not copy (a pattern or a path in `libs/types`), drop that module from `COPY_MODULES` and list the copy constants by name instead; never change a non-copy value to satisfy it.

- [x] **Step 2: Run the tests to verify they fail** (4b65836, 9 red on their assertions)

Run: `pnpm --filter @superdoc-history/web exec vitest run src/lib/copy-rules.test.ts src/features/auth src/features/sharing`
Expected: FAIL listing `'Signing in...'`, `'Creating account...'`, `'Loading document...'`, `'Opening...'`; the four `libs/types` sentences without a period; `document.title` not set; no `main` around the opening status.

- [x] **Step 3: Commit the red tests** (4b65836)

```bash
git add apps/web/src/lib/copy-rules.test.ts apps/web/src/features/auth/sign-in-page.test.tsx apps/web/src/features/sharing/share-landing-page.test.tsx apps/web/src/features/auth/auth-copy.ts
git commit -m "test(web): pin one ellipsis, sentence periods and auth copy in one place"
```

- [x] **Step 4: Implement the copy** (9b582c1)

`auth-copy.ts`:

```ts
export const SIGN_IN_LABEL = 'Sign in';
export const SIGN_IN_PENDING_LABEL = 'Signing in…';
export const SIGN_UP_LABEL = 'Sign up';
export const SIGN_UP_PENDING_LABEL = 'Creating account…';
export const SIGN_OUT_LABEL = 'Sign out';
export const SIGN_UP_HEADING = 'Create your account';
export const SIGN_IN_DESCRIPTION = 'Use your email and password to open your documents.';
export const SIGN_UP_DESCRIPTION = 'Your documents and their history stay private to you.';
export const NO_ACCOUNT_PROMPT = 'No account yet?';
export const HAVE_ACCOUNT_PROMPT = 'Already have an account?';
export const NAME_FIELD_LABEL = 'Name';
export const EMAIL_FIELD_LABEL = 'Email';
export const PASSWORD_FIELD_LABEL = 'Password';
```

(The sign-up subtitle keeps its wording: rewording it is P3-2, out of scope.)

`editor-copy.ts`: `LOADING_DOCUMENT_MESSAGE = 'Loading document…'`, `SHARE_OPENING_MESSAGE = 'Opening…'`.

`libs/types/src/documents.ts`: `INVALID_SHARE_LINK_MESSAGE = 'This link is no longer valid.'`, `DOCUMENT_UNAVAILABLE_MESSAGE = 'This document is no longer available.'`.

`libs/types/src/timeline.ts`: `HISTORY_CATCHING_UP_MESSAGE = 'History is catching up.'`, `NO_MATCHING_EDITS_MESSAGE = 'No edits match.'`.

Check nobody asserts the old literals: `rg -n "no longer valid'|no longer available'|History is catching up'|No edits match'|Signing in\.\.\.|Opening\.\.\." apps libs e2e` prints only the constants' own lines.

- [x] **Step 5: Implement the pages** (9b582c1)

`sign-in-page.tsx`: `useDocumentTitle(SIGN_IN_LABEL);`; `<CardTitle>{SIGN_IN_LABEL}</CardTitle>`, `<CardDescription>{SIGN_IN_DESCRIPTION}</CardDescription>`, the field labels from `EMAIL_FIELD_LABEL` and `PASSWORD_FIELD_LABEL`, and the cross-link:

```tsx
<p className="text-center text-sm text-muted-foreground">
  {NO_ACCOUNT_PROMPT}{' '}
  <Link to={AppRoute.SignUp} className="text-primary underline-offset-4 hover:underline">
    {SIGN_UP_LABEL}
  </Link>
</p>
```

`sign-up-page.tsx`: `useDocumentTitle(SIGN_UP_HEADING);`; `SIGN_UP_HEADING`, `SIGN_UP_DESCRIPTION`, `NAME_FIELD_LABEL`, `EMAIL_FIELD_LABEL`, `PASSWORD_FIELD_LABEL`, `HAVE_ACCOUNT_PROMPT` and `SIGN_IN_LABEL` replace the literals the same way.

`share-landing-page.tsx`:

```tsx
if (!failureMessage) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
      <p role="status" className="text-sm text-muted-foreground">{SHARE_OPENING_MESSAGE}</p>
    </main>
  );
}
```

- [ ] **Step 6: Run every gate** (after merge d412020: typecheck green, web 272/272; server 382/383, the one red is the timeline-routes latency budget under machine load; E2E not run, port 3100 held by another agent)

Run: `pnpm typecheck && pnpm test:unit && pnpm test:e2e`
Expected: PASS. The E2E suite exercises the renamed labels (`REGROUP_TOPICS_LABEL`, the Delete menu, the band locator) through their constants.

- [x] **Step 7: Commit** (9b582c1)

```bash
git add apps/web/src/features/auth/auth-copy.ts apps/web/src/features/auth/sign-in-page.tsx apps/web/src/features/auth/sign-up-page.tsx apps/web/src/features/sharing/share-landing-page.tsx apps/web/src/features/editor/editor-copy.ts libs/types/src/documents.ts libs/types/src/timeline.ts
git commit -m "fix(web,types): one ellipsis, sentence periods, auth copy in its file and a centred share landing"
```

---

## Failure modes

| Step | What breaks | How I notice (the concrete signal) | How I back out |
|------|-------------|------------------------------------|----------------|
| 1.5 | The hand-written dropdown primitive diverges from shadcn and a later `shadcn add` overwrites it | `git diff` on `dropdown-menu.tsx` after any shadcn command | Re-apply this plan's file; it is the full source |
| 1.6 | SuperDoc defines `--sd-comments-highlight-*` without reading the fallback variable in a later version, so the viewer stays pink | Screenshot 21 at 1280 shows pink runs after the change | Set `--sd-comments-highlight-internal` and `-external` directly in `:root` after the SuperDoc stylesheet import |
| 2.4 | `formatRange` output differs by ICU version (thin spaces, collapsed parts) and an assertion that splits on `' – '` breaks | A red `streamgraph.test.tsx` description test | Assert with `formatTimestamp`, never by splitting a range |
| 3.6 | Roving `tabIndex` leaves no tab stop when `highlightedBandId` names a filtered-out band | `path[tabindex="0"]` count 0 | `focusableBandIdOf` falls back to the first shape; add the case to the test |
| 4.6 | `scrollIntoView` scrolls the outer page on a phone each time the summary polls | Test plan box P1-5 at 375: page jumps on every poll | The reveal key only changes on a new summary key or running state; if it still jumps, scope to `block: 'nearest', inline: 'nearest'` and the panel's own scroller |
| 6.4 | `hidden sm:table-cell` on a header but not its cells misaligns columns | Screenshot 08/09 at 375 shows shifted cells | Both header and cells read `columnClass(column)` |
| 7.5 | `fit-width` measures before the flex layout settles and the page stays at 100% on a phone | Screenshot 07-375 still scrolls sideways | Call `superdoc.setZoomMode(ZoomMode.FitWidth)` again from `onReady` when `initialZoomMode()` is `FitWidth` |
| 7.5 | `focus()` on a collaboration room that has not synced puts the caret before remote content arrives | New document E2E: typing lands at position 0 above a peer's text | Focus from `onCollaborationReady` instead of `onReady` |
| 7.6 | A Dialog opened from the menu leaves `pointer-events: none` on `body` | Task 8 test: Download click after Cancel does nothing | `modal={false}` on the menu (already in the plan); if it persists, open the dialog in a `setTimeout(…, 0)` from `onSelect` |
| 8.4 | `navigator.clipboard` is undefined in jsdom without `userEvent.setup()` | `TypeError` in the refused-clipboard tests | Each clipboard test calls `userEvent.setup()` before spying, as the existing Copy test does |
| 9.4 | A server test or E2E asserts the old message literal without the period | A red server unit test after the `libs/types` change | Use the constant in that test; the constant is the contract |

**Steps with no backout:** none. Every step is a code or copy change on a branch.

## Z. Prove and ship

- [ ] **Tester briefing:** a developer wrote `tester-briefing.md` (what changed per audit item, how to run, red-then-green tests, every "it works" as a hypothesis, the audit screenshot folder path).
- [ ] **Tester run:** a fresh `tester` sub-agent executed `test-plan.md` at 1280 and 375 and ticked every box with evidence.
- [ ] **Reviewer:** a fresh `reviewer` sub-agent returned a verdict; refutation of the three riskiest claims is recorded in `test-plan.md`.
- [ ] **/check-ui:** screenshots and video recorded and uploaded.
- [ ] **/open-pr:** gates passed, learnings sweep stated, PR opened.
