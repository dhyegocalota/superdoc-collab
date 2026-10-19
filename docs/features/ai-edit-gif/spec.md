# AI edit GIF in the README

**Lane:** docs (media plus one README section)
**Status:** Shipped 2026-10-19
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (owner's request, translated: "An AI client editing the document like a real person, with AI attribution showing on the timeline beside the humans, is the kind of thing nobody else will show. It deserves a GIF in the README")
**Not changing:** product code

## Change

- A recorded walk, scripted with Playwright against a local stack with the fake model: Ana opens a document with a few human edits; an AI client connects through the OAuth flow (`e2e/agent.ts`: `connectAiClient`, `callTool`) and edits two paragraphs through the MCP tools while Ana's editor and timeline are on screen; the timeline shows the agent's mark beside the human bands and the connected app under Settings → Connected apps.
- Output: `docs/media/readme/ai-edit.gif` (under 8 MB, 1280 px wide, 12 fps, ffmpeg palette pass) and `docs/media/readme/ai-edit.png` (the final frame), committed. README gains a short section "An AI client edits beside the humans" with the GIF, two sentences, and a link to `docs/features/agentic-history-mcp/spec.md`.
- The recording script lives in the scratchpad, never in the repository.

## Test list

- `pnpm verify` class `docs`. The repository-shape README tests stay green. The GIF plays in GitHub's Markdown preview (checked by opening the raw file).
