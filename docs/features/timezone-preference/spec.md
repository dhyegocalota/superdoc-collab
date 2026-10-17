# Time zone preference — spec

- Status: Approved
- Tier: red (a user preference, every time label, the timeline bin alignment and the version a bin opens).
- Owner approval: requirement stated 2026-10-17 ("tem que funcionar hiper bem e cuidadosamente a questão do timezone… uma página de preferência que por padrão utiliza o timezone do browser"; "tem que ficar claro pro usuário qual é o timezone dele mesmo quando tiver nulo"); design decided by the lead under the owner's "faça tudo sozinho" of the same day. Every ruling below is the lead's and can be overridden.
- ADRs: [0024](../../adr/0024-times-follow-the-readers-zone-storage-stays-epoch.md).
- Not changing: storage (epoch milliseconds everywhere), version marks per minute, the bin ladder and `MAX_BINS`, cooldowns and caps (durations, zone-free).

## Problem

The audit ([`audit.md`](audit.md)) found storage and comparisons correct, and one defect with several faces: timeline bins floor epoch milliseconds, so bins of an hour and longer split at UTC boundaries. A reader in America/Sao_Paulo sees a day run from 21:00 to 21:00, weeks start Wednesday 21:00, 6 h and 12 h bins start at odd hours, and in Europe/Lisbon's summer every bin of 3 h or more shifts by an hour. Labels use the browser's zone and locale, frozen at load, so a user cannot pick a zone and a Portuguese browser mixes Portuguese month names into English copy. Imported tracked-change dates without an offset parse in the server's zone. Nothing pins a zone in tests.

## Goals

- Every account has a zone. Accounts created since invite-only store the browser's zone at sign-up; older ones get it at their next sign-in. A preferences page lets the user change it.
- The zone in use is always visible: on the preferences page and next to the timeline ("Times in America/Sao_Paulo"). If the stored zone is still `null` (a session that has not backfilled yet), the browser's zone is used and the label says "(from this browser)".
- Every time the app shows is formatted in that zone with the `en-US` locale, through one formatter module that takes the zone as an argument.
- Timeline bins are aligned to the reader's zone: a bin starts on a multiple of its size in local wall time; day bins start at local midnight; week bins start on local Monday 00:00; a bin ends where the next one starts, so a day bin across a DST change is 23 or 25 hours long.
- The version a bin opens, the edits a bin lists and the selection a summary covers use those same zone-aligned boundaries.
- Imported tracked-change dates without an offset are read as UTC (Word writes `w:date` in UTC).
- Tests prove the behaviour in fixed zones independently of the machine's zone.

## Non-goals

- Changing how times are stored.
- Per-document or per-organisation zones.
- Translating the UI; the locale is pinned to `en-US` to match the English copy.

## Design

### Effective zone

- `SessionUser.timeZone` exists (invite-only). The web derives the **effective zone**: the stored zone when it is a string, otherwise `browserTimeZone()`; it also derives `timeZoneSource: TimeZoneSource.Account | TimeZoneSource.Browser` for the label. One hook, `useTimeZone(): { timeZone: string; source: TimeZoneSource }`, is the only place that reads it.

### Preferences page

- `AppRoute.Settings = '/settings'`, behind `RequireSession`; a "Settings" link in the documents and admin headers next to Sign out.
- One section, "Time zone": a searchable `<select>` (native `select` with `Intl.supportedValuesOf('timeZone')` plus `UTC`, sorted, each option showing the zone and its current UTC offset, e.g. "America/Sao_Paulo (UTC−03:00)"), the current choice preselected, and a line "Your browser reports Europe/Lisbon" with a "Use this" button when the browser's zone differs from the stored one. Save calls `authClient.updateUser({ timeZone })` (validated server-side since invite-only), invalidates the session query, toasts "Time zone saved".

### Formatter

- `apps/web/src/lib/format-date-time.ts` exports the same functions with a required `timeZone` named parameter: `formatTimestamp({ time, timeZone })`, `formatBinMoment({ time, binMs, timeZone })`, `formatBinRange({ start, end, binMs, timeZone })`, `formatVersionMoment({ time, timeZone })`. `Intl.DateTimeFormat` instances are cached per `(timeZone, options)` with locale `en-US`. "Today" and "this year" are decided in the zone (by comparing zone-formatted date parts), never with `toDateString` or `getFullYear`.
- Every call site passes `useTimeZone().timeZone`.

### Zone-aligned bins

- New module `libs/history/src/timeline/zoned-time.ts`:
  - `offsetAt({ time, timeZone }): number` — milliseconds to add to UTC to get local wall time, from `Intl.DateTimeFormat(…, { timeZone, hourCycle: 'h23', … }).formatToParts`.
  - `zonedBinStartOf({ time, binMs, timeZone }): number` — for `binMs < WEEK_MS`: `local = time + offsetAt(time)`, `flooredLocal = floor(local / binMs) * binMs`, `start = flooredLocal - offsetAt(time)`; if `offsetAt(start) !== offsetAt(time)` (the floor crossed a DST change), use `flooredLocal - offsetAt(start)`. For `WEEK_MS`: floor to local midnight, then step back to Monday by the local weekday. Sub-hour bins are aligned the same way, so half- and quarter-hour zones (Asia/Kolkata, Asia/Kathmandu) align too.
  - `nextZonedBinStart({ start, binMs, timeZone }) = zonedBinStartOf({ time: start + 1.5 * binMs, binMs, timeZone })` — 23 h and 25 h days and DST hours fall out of it.
- `binStartsCovering` and `groupIntoRuns` take `timeZone` and use these instead of epoch floors; the padding rule of ADR 0016 is unchanged (one empty bin each side).
- `TimelineBin` gains `end: number`. `buildBins` resolves `versionSequence` at `end - 1`. The web uses `bin.end` everywhere it used `start + binMs` (`bin-containing.ts`, `streamgraph.tsx`, `formatBinRange`).
- `chooseBinMs` still picks the size from the span alone; zone never changes the size.

### API

- `TimelineQueryParam.TimeZone = 'timeZone'`, **required** on `/timeline`, `/timeline/edits` and `/summaries/selection`, validated with `isSupportedTimeZone`; missing or unknown answers 400 `INVALID_TIMELINE_QUERY_MESSAGE`. No implicit default: a client that does not say its zone gets an error, not UTC bins.
- `/timeline/edits?binStart=` resolves its end with `nextZonedBinStart`. The selection summary cache key gains the zone (two zones can share a bin start but not its end around a DST change).
- The web sends the effective zone on every timeline, edits and selection request, and the zone joins their query keys, so changing the preference refetches.

### Imported revisions

- `imported-revisions.ts` reads `item.date` with an explicit offset as is; a date without one is read as UTC by appending `Z`. A date that still does not parse throws `InvalidRevisionDateError` naming the revision.

### Tests and CI

- Unit tests pass explicit zones, so they do not depend on the machine: America/Sao_Paulo, Europe/Lisbon across 2026-03-29 and 2026-10-25, Asia/Kolkata, Asia/Kathmandu, Pacific/Kiritimati, UTC.
- One CI leg runs the `libs` and `server` unit suites under `TZ=Asia/Kolkata`, to prove the server code never reads the process zone.
- E2E: a settings spec (change the zone, see the timeline label and a tooltip move), and the existing time-travel specs keep passing with the browser context zone set to America/Sao_Paulo.

## Failure handling

| Failure | Behaviour |
|---|---|
| Timeline request without or with an unknown `timeZone` | 400; the web never sends one without it |
| Stored zone no longer in the runtime's list (tzdata change) | the server keeps it (it validated at write time); the web falls back to the browser zone with the "(from this browser)" label and the settings page shows the stored value as invalid |
| DST gap or overlap inside a bin | bins are built from instants, so the gap bin is shorter and the overlap bin longer; no bin is empty because of the clock change alone |
| Save on the settings page fails | the select keeps the chosen value, an inline error shows, nothing toasts |

## Open questions → answers

| Question | Options | Lead's ruling | Date |
|---|---|---|---|
| Where the preference lives | user column (exists); local storage | user column, set at sign-up | 2026-10-17 |
| Required zone parameter or default UTC | required; default UTC | required (no silent default) | 2026-10-17 |
| Week start | Monday; Sunday; locale | Monday (ISO 8601) | 2026-10-17 |
| Locale | browser; pinned `en-US` | pinned `en-US`, matching the English copy | 2026-10-17 |
| Offset-less imported dates | throw; read as UTC | read as UTC (Word writes UTC) | 2026-10-17 |
