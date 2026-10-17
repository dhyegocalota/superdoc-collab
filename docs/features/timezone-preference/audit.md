# Time zone audit (read-only, 2026-10-17)

Produced by a researcher sub-agent before the brainstorm; nothing was edited. Paths are repository-relative.

## Summary

Product time is stored and compared as UTC epoch milliseconds, and no server code reads local time. The one real defect: timeline bins floor epoch milliseconds, so a reader in America/Sao_Paulo sees day, week, 6 h and 12 h bins split at the wrong local hour. Premise corrections: Europe/Lisbon is UTC+0 in winter and UTC+1 in summer; America/Sao_Paulo is UTC-3 with no DST since 2019.

## Findings map

| Location | What it does | Zone assumed | Verdict |
|---|---|---|---|
| `libs/history/src/update-log.ts:60` | stamps each update with `Date.now()` | UTC epoch | OK |
| `libs/history/src/schema/history.ts:10`, `schema/read-model.ts:10,36` | `server_time` integer columns | UTC epoch | OK |
| `apps/server/src/database/schema/auth.ts` (created/updated/expires) | `unixepoch('subsecond')*1000`, `timestamp_ms` | UTC epoch | OK |
| `apps/server/src/database/schema/documents.ts`, `insights.ts` | `timestamp_ms` read back as `Date` | UTC epoch | OK |
| `apps/server/src/documents/documents-repository.ts` | writes `new Date()`, returns `getTime()` | UTC epoch | OK |
| `libs/history/src/imported-revisions.ts:37` | `Date.parse(item.date)` on the tracked-change `w:date` | server local when no offset | RISK, bug 5 |
| `libs/history/src/timeline/bins.ts:19-21` | `binStartOf` floors epoch ms to a multiple of `binMs` | UTC grid | RISK for 6 h, 12 h, 1 day, 1 week |
| `libs/history/src/timeline/bins.ts:23-26`, `runs.ts:38` | covering and grouping on the same grid | UTC grid | RISK, same cause |
| `libs/history/src/timeline/bins.ts:8` | `WEEK_MS = 10080 min`; the epoch is a Thursday | weeks start Thursday 00:00 UTC | RISK, weeks |
| `libs/history/src/timeline/bins.ts:13-17` | `chooseBinMs` from the span only | none | OK, size never depends on a zone |
| `apps/server/src/history/timeline-service.ts`, `timeline-query.ts`, `timeline-routes.ts` | bins built server-side; no zone parameter | UTC grid | RISK, no zone carried |
| `apps/web/src/features/timeline/timeline-api.ts` | sends `binMs` and `binStart`, never a zone | none | RISK, no zone carried |
| `libs/history/src/version-marks.ts` | marks per whole minute; `versionSequenceAt` | epoch | OK (every zone is a whole-minute offset) |
| `apps/web/src/lib/format-date-time.ts:1-2` | two `Intl.DateTimeFormat(undefined, …)` built at module load | browser zone and locale, frozen at load | OK for zone; LOW bugs 9 and 10 |
| `apps/web/src/features/versions/version-banner.tsx` | "Today" by `toDateString`; "Version at …" from `serverTime` | browser zone | OK; the "Loading … <bin end>" line inherits the grid |
| `apps/web/src/features/timeline/timeline-tooltip.tsx:75`, `bin-edits.tsx:50`, `streamgraph.tsx:139-140` | bin ranges in tooltip, header, accessible description | browser zone over a UTC grid | RISK, inherits |
| `apps/web/src/features/documents/document-table.tsx:34` | "Updated" column | browser zone | OK |
| cooldowns, caps, TTLs, `Retry-After` (server and web) | epoch differences and seconds | durations | OK |
| `apps/server/src/insights/prompts.ts` | no timestamps in prompts | none | OK, keep it so |
| whole product | no `getHours`, `setHours`, `getDate`, `new Date(y, m, d)`, ISO slicing, date libraries | none | OK |
| CI, Playwright, vitest configs, Dockerfile, entrypoint, `railway.json` | no `TZ`, no `timezoneId` | runner or image default | RISK, nothing pins a zone |

## What a São Paulo reader sees today

| Bin | Chosen for spans of | São Paulo local start | Lisbon winter | Lisbon summer |
|---|---|---|---|---|
| 10 s to 1 h | up to ~4.9 days | aligned | aligned | aligned |
| 3 h | ~4.9 to 14.6 days | aligned | aligned | 01, 04, 07 … |
| 6 h | ~14.6 to 29.3 days | 03, 09, 15, 21 | 00, 06, 12, 18 | 01, 07, 13, 19 |
| 12 h | ~29.3 to 58.5 days | 09, 21 | 00, 12 | 01, 13 |
| 1 day | ~58.5 to 117 days | 21:00 the day before | 00:00 | 01:00 |
| 1 week | beyond ~117 days | Wednesday 21:00 | Thursday 00:00 | Thursday 01:00 |

## Bugs, ranked

1. Day bins split at 21:00 in São Paulo. Fix: the client sends its IANA zone with timeline, edits and selection requests; the server floors each bin on the zone's local boundary using the offset at that instant; the zone joins the cache keys.
2. 6 h and 12 h bins start at odd hours (from ~15 days of history). Same fix.
3. Week bins start Wednesday 21:00. Fix: floor weeks to local Monday 00:00; record in an ADR.
4. Lisbon summer shifts every bin of 3 h or more by one hour. Same cause; clocks change 2026-03-29 and 2026-10-25, both dates go in tests.
5. Imported tracked-change dates without an offset parse in the server's zone (`imported-revisions.ts:37`). Fix: require an explicit offset, throw a named error otherwise. How often Word omits the offset is unverified.
6. The invite spec named `formatDateTime`; the shared formatter is `formatTimestamp` (fixed in the invite spec on 2026-10-17).
7. No test would fail in a wrong zone: formatter tests compare against the same `Intl` call.
8. `DAY_MS` and `WEEK_MS` are local to `bins.ts` and its test; `libs/types/src/constants.ts` lacks them (shared-constants rule).
9. LOW: dates use the browser locale (`undefined`), so a Portuguese browser shows Portuguese month names under English copy.
10. LOW: the formatter's zone is frozen at module load.

## Correct today and must stay so

Storage in UTC epoch ms everywhere; cooldowns, caps, TTLs and `Retry-After` as epoch differences or seconds; minute marks zone-free; countdowns in seconds, never clock times; prompts without timestamps; client text in the reader's zone; the "Updated" column.

## Tests to add

- `libs/history/src/timeline/bins.test.ts`: day bins start at local midnight in America/Sao_Paulo (03:00Z); 6 h bins at 00, 06, 12, 18 local; week bins on local Monday; Europe/Lisbon day bins stay on local midnight across 2026-03-29 and 2026-10-25; Asia/Kolkata hour bins on the local hour (a half-hour zone).
- `apps/server/src/insights/document-cooldown.test.ts`: remaining time exact across Lisbon's 2026-10-25 fall-back with a fake clock.
- `libs/history/src/imported-revisions.test.ts`: `2026-03-01T15:30:00-03:00` equals `2026-03-01T18:30:00Z`; an offset-less date throws.
- `apps/web/src/lib/format-date-time.test.ts`: with en-US fixed, `Date.UTC(2026, 9, 17, 0, 0)` reads "Oct 16, 2026, 9:00 PM" in America/Sao_Paulo and "Oct 17, 2026, 1:00 AM" in Europe/Lisbon.
- `apps/server/src/history/timeline-routes.test.ts`: an invalid zone is 400; a valid zone returns day bins at local midnight.
- CI: `pnpm test:unit` under `TZ=America/Sao_Paulo`, `Europe/Lisbon`, `Asia/Kolkata`, `Pacific/Kiritimati` as a matrix job.
- E2E: Playwright projects with `timezoneId` America/Sao_Paulo and Europe/Lisbon; a seeded edit at a known UTC instant shows the reader's clock in banner and tooltip.

## Not verified

No suite was run under another `TZ`; the Railway container zone and the `w:date` format Word writes were not checked; SuperDoc's date string format was not found in its dist.
