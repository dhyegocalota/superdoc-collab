# Tester briefing: Time zone preference

Written by the lead from the lane reports. Nobody on the build side ran `test-plan.md`.

## What changed

- `libs/types`: `WEEK_MS`, `TimelineBin.end`, `TimelineQueryParam.TimeZone`, `TimeZoneSource`, `AppRoute.Settings`.
- `libs/history`: `timeline/zoned-time.ts` (`offsetAt`, `zonedBinStartOf`, `nextZonedBinStart`); bins, covering and runs take `timeZone`; every bin carries `end`, and its version resolves at `end - 1`; week bins start on local Monday (anchored on 1970-01-05); `parseRevisionDate` reads offset-less imported dates as UTC.
- `apps/server`: `timeZone` is required on `/timeline`, `/timeline/edits` and `/summaries/selection` (400 when missing or unknown); bins are built in it; the selection cache key includes it; per-topic summaries group runs in UTC on purpose; one CI leg runs `libs` and `server` under `TZ=Asia/Kolkata`.
- `apps/web`: one formatter with a required zone and the `en-US` locale; `useTimeZone()` returns the account zone or the browser's with its source; every timeline request sends the zone and keys on it; `/settings` with the zone select, the browser hint and Save; "Settings" in the headers; "Times in <zone>" next to the timeline, with "(from this browser)" when the account has none.
- `e2e`: the whole suite runs with `timezoneId: 'America/Sao_Paulo'`; `settings.spec.ts` changes the zone and checks the label and a tooltip shift.

## How to run

- Unit: `pnpm typecheck && pnpm test:unit`, and `TZ=Asia/Kolkata pnpm --filter @superdoc-collab/history test:unit`.
- E2E: `pnpm test:e2e`.
- Walk: a local stack (`ENV_FILE=.env.example APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=true docker compose up --build -d`); seeded users have zone `UTC`. Open contexts with `timezoneId` Europe/Lisbon and America/Sao_Paulo. To get a `null` zone, clear it in `auth.sqlite` inside the container (`update user set time_zone = null where email = 'bruno@example.com'`) before Bruno signs in, then confirm the sign-in backfills it.
