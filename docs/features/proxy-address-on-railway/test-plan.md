# Test plan: Client address behind Railway's proxy

- [x] `client-address.test.ts` rightmost with one hop — expected: `7.7.7.7` from `7.7.7.7`
- [x] A spoofed leftmost entry is ignored — expected: `6.6.6.6, 7.7.7.7` resolves `7.7.7.7`
- [x] Two hops — expected: `6.6.6.6, 7.7.7.7, 10.0.0.1` resolves `7.7.7.7`
- [x] Fewer entries than hops — expected: one entry with two hops resolves the remote address
- [x] Absent header and `trustProxy` false — expected: the remote address
- [x] `environment.test.ts` — expected: `TRUSTED_PROXY_HOPS` defaults to 1; `0`, `-1`, `1.5` and `two` refuse to start naming the variable
- [x] `app.test.ts` limiter route — expected: four sign-ins with rotating leftmost entries and one rightmost entry are limited with 429
- [x] `tsc --noEmit` in `apps/server` — expected: clean
- [ ] OWNER after deploy: the probe in `tester-briefing.md` — expected: 429 on the fourth failed sign-in with and without the spoofed header
