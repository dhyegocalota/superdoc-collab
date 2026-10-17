# Tester briefing: Agentic history over MCP

Written by the developer sub-agent when its steps are done. The developer does not run `test-plan.md` and does not declare the feature works.

## What changed

- <file or module> — <one line>

## How to run

```bash
<commands to start the stack and open the feature>
```

## Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `<path>::<name>` |  |  |

## Hypotheses to attack

Every "it works" is a hypothesis the tester tries to break.

1. Hypothesis: <claim>. Break it by: <suggested attack>.

## Known gaps

- <what the developer knows is missing or untested>

## L4 web

### What changed

- `apps/web/src/features/auth/auth-client.ts`: the `oauthProviderClient()` plugin, which adds the signed `oauth_query` to every non-GET auth request made while the consent query string is in the address bar.
- `apps/web/src/features/oauth-consent/`: the consent page at `AppRoute.OAuthConsent` behind `RequireSession` (the sign-in `next` keeps pathname and query string). `oauth-consent-copy.ts` holds the scope sentences per `AgentScope`.
- `apps/web/src/features/connected-apps/`: the page at `AppRoute.ConnectedApps` behind `RequireSession`, linked from the documents header next to the user name.
- `apps/web/src/features/timeline/`: `agent-hatch.tsx`, `agent-legend.tsx` and `agent-action-marks.tsx`; the layout gains `agentPath` per band and `timeX`; `AuthorAvatar` takes `actor`.
- `apps/web/src/testing/timeline-fixtures.ts`: `timelineWith` takes `agentVolumes` and `agentActions`; the fixture authors include an agent `ana#agent` named "Ana · AI".

### Better Auth client calls

| Where | Call |
|---|---|
| client name on the consent page | `authClient.oauth2.publicClient({ query: { client_id } })` reading `client_name` |
| Approve and Deny | `authClient.oauth2.consent({ accept })`; the response is `{ redirect: true, url }` and Better Auth's redirect plugin sets `window.location.href`, so the page never navigates itself |
| Connected apps list | `authClient.oauth2.getConsents()` joined with `publicClient` per `clientId` |
| Revoke | `authClient.oauth2.deleteConsent({ id })`, then `invalidateQueries` on `['connected-apps']` |

The consent page reads `client_id` and `scope` (space separated) from the query string and renders every requested scope; a scope outside `AgentScope` is printed as is. A request without `client_id` or `scope` shows the incomplete message and renders no buttons.

### Selectors for the E2E lane

| Surface | Selector |
|---|---|
| consent buttons | `getByRole('button', { name: 'Approve' })`, `getByRole('button', { name: 'Deny' })` |
| consent scope list | `getByRole('region', { name: 'It will be able to' })` |
| header link | `getByRole('link', { name: 'Connected apps' })` |
| revoke | `getByRole('button', { name: 'Revoke <client name>' })` |
| empty state | text "No AI clients connected yet" |
| copy buttons | `getByRole('button', { name: 'Copy MCP URL' })`, `'Copy Claude Code'`, `'Copy Cursor'`, `'Copy ChatGPT'`; the clipboard needs permissions in Chromium |
| hatched agent layer | `svg path[data-actor="agent"]`, `aria-hidden`, `fill="url(#agent-hatch-<band id>)"`; patterns in `svg defs pattern` |
| legend row | text "Hatched: edited by AI" |
| AI badge | element with `aria-label="Edited by AI"` inside the avatar `li` whose `title` is "Name · AI" |
| action marks | `getByRole('button', { name: '<Name · AI> revealed a share link' })` (also "rotated a share link", "exported the document"); hovering or focusing shows `role="tooltip"` with the same sentence |

### Red today, green after

| Test | Red before the change because | Green after because |
|------|--------------------------------|---------------------|
| `features/oauth-consent/oauth-consent-page.test.tsx` (6555eff) | `OAuthConsentPage is not implemented` (5 tests) | page, api and hooks (e4ec03b) |
| `features/connected-apps/connected-apps-page.test.tsx` (e2e2fe8) | `ConnectedAppsPage is not implemented` | page, api, hooks, copy buttons (10be077) |
| `features/documents/documents-page.test.tsx::the header links to the connected apps page` | `Unable to find role="link" and name "Connected apps"` | header link (10be077) |
| `features/timeline/streamgraph-layout.test.ts::a band without agent volume has no agent path…` (f680ee6) | `.toMatch() expects to receive a string, but got object` (the path was null) | `agentPath` computed (c37b262) |
| `features/timeline/streamgraph.test.tsx` agent layer and legend row (f680ee6) | `expected  to have a length of 1 but got +0`; `Unable to find an element with the text: Hatched: edited by AI` | layer, pattern, legend (c37b262) |
| `features/timeline/contributor-avatars.test.tsx::an agent author shows the AI badge…` (f680ee6) | `Unable to find a label with the text of: Edited by AI` | badge (c37b262) |
| `features/timeline/streamgraph-layout.test.ts::timeX maps a moment…` (e050943) | `timeX is not implemented` | `timeX` (3d78702) |
| `features/timeline/streamgraph.test.tsx` action marks (e050943) | `Unable to find an accessible element with the role "button" and name "Ana · AI revealed a share link"` | marks (3d78702) |

Pins, green when they landed: the streamgraph tooltip lists the agent author once with the suffix; a timeline without agent actions renders no marks; the fixture commit 31910aa only adds the required `actor`, `agentInserted`, `agentDeleted` and `agentActions` fields.

### Hypotheses to attack

1. Hypothesis: opening the authorization URL signed out lands on sign-in, and after sign-in returns to the consent page with the full signed query string. Break it by: sign in with a different account than the one used before, reload the consent page, press Back.
2. Hypothesis: Approve and Deny each redirect the browser to the client's `redirect_uri` exactly once. Break it by: double-clicking Approve; the buttons disable on the first click.
3. Hypothesis: Revoke removes the row after the refetch and the client's next call is 401. Break it by: revoking with a second tab open on the same page, then revoking the same row again.
4. Hypothesis: the hatched layer height equals the agent share of the band at every bin and the band stays selectable under it. Break it by: a bin where only the agent edits, a bin where nobody edits, clicking on the hatched area.
5. Hypothesis: marks sit at their action time on the axis and their tooltips stay inside the chart at both edges. Break it by: an action at the first and last bin, two actions in the same second, 375 px width.
6. Hypothesis: snippets wrap at 375 px without horizontal scroll. Break it by: the Cursor JSON block at 375 px.

### Known gaps

- Dark mode: the hatch uses `fill-background` for the gap between stripes; not checked visually in dark mode.
- Several action marks at nearly the same time overlap; no clustering.
- The consent page does not offer choosing a subset of scopes; Approve accepts all requested scopes.
- `AuthorAvatar` in the selection summary card derives the actor from the " · AI" suffix of the name, because summaries carry names only.
- Nothing here was run in a browser; the redirect after Approve is the redirect plugin's behaviour and is only unit-tested through the mocked client.
