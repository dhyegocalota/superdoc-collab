# Test plan: Sign-in follows next

- [x] Red first: `redirect-if-session.test.tsx::a signed-in user goes to the page named by next` fails on 16482d4 with "Unable to find an element with the text: admin page" — evidence: reviewer re-ran it, 1 failed, 3 passed.
- [x] Green: `apps/web` auth folder 46 passed at 4ecdb95 — evidence: local run and reviewer.
- [x] Hostile `next` values (another origin, `//`, `/\`, tab and newline, dot segments, `javascript:`, `data:`) fall back to documents — evidence: `safe-next-path.test.ts` plus the security reviewer's probes; verdict CLEAR.
- [x] No loop: `next=/sign-in?next=/sign-in` ends on documents after two hops — evidence: reviewer.

## Coverage honesty

- A multi-hundred-kilobyte `next` can make `history.replaceState` throw in some browsers, blanking that one link for that visitor; accepted (security reviewer, MINOR).
