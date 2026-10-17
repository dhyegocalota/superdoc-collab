# Time zone preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** every time the app shows, and every timeline bin, follows the user's chosen zone (browser zone by default), the zone in use is always visible, and a preferences page changes it.

**Architecture:** a pure `zoned-time` module in `libs/history` computes local-wall-time bin starts from instants with `Intl` offsets; bins carry an explicit `end`; the server requires `timeZone` on timeline, edits and selection requests and builds bins in it; the web derives one effective zone (`useTimeZone`), passes it to a zone-aware formatter pinned to `en-US`, sends it on every timeline request, and gains `/settings`.

**Tech Stack:** TypeScript, `Intl.DateTimeFormat` / `Intl.supportedValuesOf`, Hono, zod, React 19, TanStack Query, shadcn/ui, Vitest, Playwright (`timezoneId`).

**Spec:** `docs/features/timezone-preference/spec.md` (ADR 0024), audit in `audit.md`.

## Global Constraints

- No comments except `// NB ADR NNNN:`; flat ifs; no else; no `?? default`; enums; named parameters; array methods; no `.js` imports; constants in `libs/types` (`DAY_MS` exists; add `WEEK_MS` there and import it in `bins.ts`, deleting the local one).
- Red commit, then green commit, per task. Branch `feat/timezone-preference`. Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No code reads the process zone: no `new Date(y, m, d)`, `getHours`, `getDate`, `getDay`, `toDateString`, `getFullYear`, `toLocale*` without an explicit `timeZone`.
- `timeZone` is never defaulted: absent or unknown is an error at the API, and the web always has an effective zone.

## Review Focus

1. A day bin spanning a DST change (Europe/Lisbon 2026-03-29 and 2026-10-25) is 23 h and 25 h long, starts at local midnight, and its version resolves at `end - 1`.
2. Half- and quarter-hour zones (Asia/Kolkata +05:30, Asia/Kathmandu +05:45) align 10-minute, 1-hour and day bins to local boundaries.
3. Week bins start on local Monday 00:00 in every zone, including Pacific/Kiritimati (+14:00) where UTC Monday is local Tuesday.
4. A client that omits `timeZone` gets 400, never UTC bins; the selection cache never serves one zone's bin to another zone with a different end.
5. Changing the preference refetches the timeline (zone in the query keys) and relabels every time on the page without a reload.

## Lanes

| Lane | Paths owned | Model |
|------|-------------|-------|
| Z1 core | `libs/types/src/timeline.ts`, `libs/types/src/constants.ts`, `libs/types/src/auth.ts` (TimeZoneSource only), `libs/history/src/timeline/*`, `libs/history/src/imported-revisions*.ts` | strongest |
| Z2 server | `apps/server/src/history/timeline-*.ts`, `apps/server/src/insights/selection-*.ts`, `apps/server/src/insights/summaries-service.ts`, their tests, `.github/workflows/verify.yml` (one TZ leg) | mid |
| Z3 web | `apps/web/src/lib/format-date-time*.ts`, `apps/web/src/features/**` call sites, `apps/web/src/features/settings/*` (new), `apps/web/src/app/router.tsx`, headers | mid |
| Z4 e2e + docs | `e2e/*`, `playwright.config.ts` (`timezoneId: 'America/Sao_Paulo'` for the whole suite), `docs/install.md`, `.claude/rules/*` touched facts | mid |

Z1 first; Z2, Z3, Z4 in parallel on Z1's types (Z3 and Z4 mock or wait for Z2 only for E2E runs).

### Task Z1.1: shared types

- `TimelineQueryParam.TimeZone = 'timeZone'`; `TimelineBin.end: number`; `WEEK_MS = 7 * DAY_MS` in constants; `enum TimeZoneSource { Account = 'account', Browser = 'browser' }`.
- Test: `routes.test.ts`/`timeline.test.ts` pin the new enum value and that `WEEK_MS === 604_800_000`.

### Task Z1.2: `zoned-time.ts`

```ts
import { DAY_MS, WEEK_MS } from '@superdoc-collab/types';

const PART_FORMATS = new Map<string, Intl.DateTimeFormat>();
const MONDAY_INDEX = 1;
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function partsFormat(timeZone: string): Intl.DateTimeFormat {
  const cached = PART_FORMATS.get(timeZone);
  if (cached) return cached;
  const created = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', weekday: 'short' });
  PART_FORMATS.set(timeZone, created);
  return created;
}

export function offsetAt({ time, timeZone }: { time: number; timeZone: string }): number { … local fields → Date.UTC(...) - floor(time / 1000) * 1000 … }
export function zonedBinStartOf({ time, binMs, timeZone }: { time: number; binMs: number; timeZone: string }): number { … spec algorithm; weeks via local midnight and weekday … }
export function nextZonedBinStart({ start, binMs, timeZone }: { start: number; binMs: number; timeZone: string }): number { return zonedBinStartOf({ time: start + 1.5 * binMs, binMs, timeZone }); }
```

The developer writes the bodies from the spec's algorithm; the tests below are the contract.

- Tests (`zoned-time.test.ts`, each with literal UTC instants):
  - `offsetAt`: São Paulo −3 h; Lisbon 0 h on 2026-01-15 and +1 h on 2026-07-15; Kathmandu +5 h 45; Kiritimati +14 h.
  - day bins: São Paulo `Date.UTC(2026, 9, 17, 2, 0)` → `Date.UTC(2026, 9, 16, 3, 0)`; Lisbon spring day 2026-03-29 starts `Date.UTC(2026, 2, 29, 0, 0)` and ends `Date.UTC(2026, 2, 29, 23, 0)` (23 h); autumn 2026-10-25 starts `Date.UTC(2026, 9, 24, 23, 0)` and ends `Date.UTC(2026, 9, 26, 0, 0)` (25 h).
  - hour and 10-minute bins in Kolkata and Kathmandu start on local :00 / :x0.
  - 6 h bins in São Paulo start at local 00, 06, 12, 18.
  - week bins start Monday 00:00 local in São Paulo, Lisbon (across both DST weeks) and Kiritimati.
  - sub-minute bins equal the epoch floor (every zone is a whole-minute offset).
  - `nextZonedBinStart` of every bin above equals the start of the following one; no bin is shorter than `binMs - 1 h` or longer than `binMs + 1 h` for day and week bins.

### Task Z1.3: bins and runs in a zone

- `binStartsCovering({ firstTime, lastTime, binMs, timeZone })` walks `nextZonedBinStart` from one bin before `zonedBinStartOf(firstTime)` to one after `zonedBinStartOf(lastTime)`; `buildBins` returns `{ start, end, versionSequence: versionSequenceAt(end - 1), byBand }`; `groupIntoRuns({ events, binMs, timeZone })` uses `zonedBinStartOf`. `binStartOf` is deleted (no caller left).
- Tests: the existing `bins.test.ts` cases pass with `timeZone: 'UTC'`; new: the covering count stays ≤ `MAX_BINS` for every ladder span in São Paulo, Kathmandu and Kiritimati; a day timeline in São Paulo has every `start` at local midnight; `end` of bin i equals `start` of bin i+1.

### Task Z1.4: imported revision dates

- `parseRevisionDate(value)`: a value with `Z` or `±hh:mm` parses as is; one without an offset parses with `Z` appended; `NaN` throws `InvalidRevisionDateError(revisionId)`.
- Tests: `2026-03-01T15:30:00-03:00` equals `Date.UTC(2026, 2, 1, 18, 30)`; `2026-03-01T15:30:00` equals `Date.UTC(2026, 2, 1, 15, 30)`; `garbage` throws.

### Task Z2.1: timeline API requires the zone

- `timelineQuerySchema` gains `[TimelineQueryParam.TimeZone]: z.string().refine(isSupportedTimeZone)` (required), so `editsQuerySchema` and `selectionQuerySchema` inherit it; timeline-service threads `timeZone` into `groupIntoRuns`, `binStartsCovering`, `buildBins`; edits resolve `end` with `nextZonedBinStart`; `selectionKeyOf` includes the zone; `summaries-service` passes `UTC_TIME_ZONE` explicitly (per-topic sentences group runs only to bound prompt size; the zone does not change their content), with an `NB ADR 0024` pointer.
- Tests (route level, real HTTP): missing `timeZone` → 400 on all three routes; `Mars/Olympus` → 400; a São Paulo day timeline's bins start at local midnight; the same document read in `UTC` and `Asia/Kathmandu` returns different starts; a selection cached for one zone is not served for another.

### Task Z2.2: process-zone independence in CI

- `verify.yml` unit matrix gains one leg running `libs` and `server` with `TZ=Asia/Kolkata`.

### Task Z3.1: formatter and effective zone

- `format-date-time.ts`: every export takes `timeZone`; formats cached per `(timeZone, options key)` with `en-US`; `isToday`/`isThisYear` compare zone-formatted parts; `formatBinRange({ start, end, binMs, timeZone })`.
- `use-time-zone.ts`: `useTimeZone(): { timeZone: string; source: TimeZoneSource }` from `useSession()` and `browserTimeZone()`.
- Every call site in the formatter list passes `timeZone`; `bin-containing.ts` and `streamgraph.tsx` use `bin.end`.
- Tests: `format-date-time.test.ts` with fixed instants: `Date.UTC(2026, 9, 17, 0, 0)` reads `Oct 16, 2026, 9:00 PM` in São Paulo and `Oct 17, 2026, 1:00 AM` in Lisbon; "today" is decided in the zone; `useTimeZone` returns the account zone, and the browser zone with `Browser` source when the stored one is `null`.

### Task Z3.2: timeline requests carry the zone

- `timeline-api.ts` sets `TimelineQueryParam.TimeZone` on timeline, edits and selection requests; the zone joins their query keys.
- Tests: requests include `timeZone=<effective>`; changing the session zone refetches.

### Task Z3.3: preferences page and the visible zone

- `AppRoute.Settings`, `features/settings/settings-page.tsx` (select of zones with UTC offsets, browser hint with "Use this", save via `authClient.updateUser`, invalidate session, toast "Time zone saved", inline error on failure), "Settings" link in documents and admin headers, "Times in <zone>" (plus "(from this browser)" when `source` is `Browser`) next to the timeline panel header, linking to `/settings`.
- Tests: page lists zones and preselects the account zone; "Use this" picks the browser zone; save calls `updateUser` and toasts; failure shows the inline error; the timeline label reads the effective zone and the browser suffix when `null`.

### Task Z4.1: E2E

- `playwright.config.ts`: `use.timezoneId = 'America/Sao_Paulo'` for every project.
- Helpers that call `/timeline`, `/timeline/edits` or `/summaries/selection` pass `timeZone` (the context's zone).
- New `e2e/settings.spec.ts`: sign in, open `/settings`, change to `Asia/Kathmandu`, save, open a document with edits, the timeline label reads Kathmandu and a tooltip's range moved by the offset difference.
- The whole suite passes under the São Paulo context.

### Task Z4.2: docs

- `docs/install.md` mentions the preference; `.claude/rules/history.md` (or the timeline rule file) gains the zone-aligned bins fact; ADR 0016's padding note references 0024.

## Failure modes

| Step | What breaks | Signal | Back out |
|------|-------------|--------|----------|
| Z1.2 | `formatToParts` returns hour `24` at midnight in some engines | day starts off by a day at local midnight | `hourCycle: 'h23'` (already) and normalise `24 → 0` with the date part |
| Z1.3 | bins overlap or leave gaps around DST | `end[i] !== start[i+1]` test fails | derive every end from `nextZonedBinStart`, never from `start + binMs` |
| Z2.1 | existing route tests call the timeline without a zone | many 400s in the server suite | the test helpers that read the timeline pass `UTC` explicitly |
| Z3 | a formatter call site left without a zone | typecheck fails (required parameter) | that is the point; fix the call site |
| Z4.1 | E2E helpers miss the zone | 400 in every timeline spec | pass the context's `timezoneId` through the helper |

**Steps with no backout:** none (no schema change).

## Z. Prove and ship

- [ ] Tester briefing, tester run, reviewer, security reviewer, `/open-pr`, CI verify and E2E green, merge, deploy to Railway.
