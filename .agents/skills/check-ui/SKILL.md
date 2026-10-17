---
name: check-ui
description: Walk a UI flow with Playwright MCP from the user's perspective — snapshot, screenshots, console and network health, optional video — and stage the media for the PR. Validation, not the test of record.
argument-hint: <url-or-route> <feature-slug> [--video] [--pr <number>]
allowed-tools: mcp__playwright__browser_navigate, mcp__playwright__browser_snapshot, mcp__playwright__browser_take_screenshot, mcp__playwright__browser_click, mcp__playwright__browser_type, mcp__playwright__browser_press_key, mcp__playwright__browser_console_messages, mcp__playwright__browser_network_requests, mcp__playwright__browser_run_code_unsafe, mcp__playwright__browser_tabs, mcp__playwright-second__browser_navigate, mcp__playwright-second__browser_snapshot, mcp__playwright-second__browser_take_screenshot, mcp__playwright-second__browser_click, mcp__playwright-second__browser_type, mcp__playwright-second__browser_press_key, mcp__playwright-second__browser_console_messages, mcp__playwright-second__browser_network_requests, mcp__playwright-second__browser_run_code_unsafe, mcp__playwright-second__browser_tabs, Bash(gh:*), Bash(git:*), Bash(ffmpeg:*), Bash(mkdir:*), Bash(ls:*), Read
---

Arguments: `$ARGUMENTS` — first token is the URL or route (bare routes use the local app host; ask which port if ambiguous), second is the feature slug used for `.pr-media/<slug>/` and the release tag; `--video` records a walkthrough; `--pr <n>` attaches the media to that pull request.

This command is the `recorder` role run inline. For anything longer than one flow, dispatch the `recorder` sub-agent instead.

## Steps

1. **Open and confirm.** `browser_navigate`, then `browser_snapshot` to verify the expected content rendered and the page did not bounce to login, 404 or an error boundary. Authentication uses the seeded demo users; log in through the real form, never by injecting cookies.
2. **Walk the flow**, not only the changed screen: entry → the feature → exit. For collaboration features drive the second author through the `playwright-second` server, never a second tab or context of the same server (ADR 0023). Take the unhappy paths: rejected input, browser Back, reload.
3. **Screenshots.** `browser_take_screenshot` for each scene into `.pr-media/<slug>/<nn>-<scene>.png` (lowercase, dashes). Read each image back and confirm it shows what the caption will claim.
4. **Health.** `browser_console_messages` at error level must be empty. `browser_network_requests` for the feature's calls must all be 2xx; list any that are not.
5. **Video** (`--video`): follow `.agents/roles/recorder.md` steps 3–4 (`recordVideo` context, close to flush, never `video.path()`, ffmpeg to `walkthrough.mp4` and `walkthrough.gif`).
6. **Attach** (`--pr <n>`): follow `.agents/roles/recorder.md` steps 5–6: pre-release `pr-media-<slug>`, `gh release upload … --clobber`, then update the PR body with `gh api repos/{owner}/{repo}/pulls/<n> -X PATCH --field body=@<file>` placing the `.mp4` URL on its own line under `## Video`, the gif as fallback, and the screenshot table under `## Screenshots`.
7. **Report** pass/fail per scene: what rendered, key values on screen, console errors, failing requests, and the media paths or URLs.

`.pr-media/` is git-ignored; never commit media. A bug found here goes back to the plan with a regression test; this command never edits product code.
