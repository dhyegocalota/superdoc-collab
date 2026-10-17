# Test plan: Agentic history over MCP

Every checkbox states the input and the exact expected outcome. A ticked box carries evidence after ` — evidence: ` (commit hash, log path, counts, screenshot path).

## The failing test first

- [ ] `<path>::<name>` — input: <input>; expected: <exact outcome>
- [ ] Confirmed it fails for the right reason: <the failure message that proves the feature is missing, not the test broken>

## Unit

- [ ] `<path>::<name>` — input: <input>; expected: <exact outcome>
- [ ] Edge: empty / null / boundary — input: <value>; expected: <exact outcome>
- [ ] Edge: the error path, with the specific error — input: <value>; expected: <error type and message>

## E2E (Playwright specs)

- [ ] `<path>::<name>` — steps: <steps>; expected: <what the user sees>

## Prove it for real — Playwright MCP

- [ ] Happy path, entry to exit: <steps>; expected: <what the user sees at each step>
- [ ] Empty: <input state>; expected: <exact outcome>
- [ ] Single: <input state>; expected: <exact outcome>
- [ ] Many: <input state>; expected: <exact outcome>
- [ ] Rejected input: <input>; expected: <exact message and state unchanged>
- [ ] Browser Back mid-flow: <step at which Back is pressed>; expected: <exact outcome>
- [ ] Reload mid-flow: <step at which the page reloads>; expected: <exact outcome>
- [ ] Two authors in two browser contexts at once: <what each does>; expected: <what each sees>
- [ ] Latency / disconnect (where relevant): <throttle or cut>; expected: <exact outcome after recovery>
- [ ] Console and network clean: zero console errors, zero failed requests, other than <expected exceptions>
- [ ] Desktop width: <viewport>; expected: <layout outcome>
- [ ] Narrow width: <viewport>; expected: <layout outcome>
- [ ] Screenshots at `<path>`; video at `<path>`

## Edge cases found during execution

Empty on purpose. The tester adds one checkbox per new case (input, exact expected outcome) and a regression test for each.

## Adversarial review

The reviewer picks the three claims most likely to be wrong and tries to refute each.

- [ ] Claim 1: <claim> — attack: <how>; result: <refuted | held>
- [ ] Claim 2: <claim> — attack: <how>; result: <refuted | held>
- [ ] Claim 3: <claim> — attack: <how>; result: <refuted | held>

## Coverage honesty

What is not tested and why.

- <untested area> — <reason and the risk accepted>
