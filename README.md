# SuperDoc Collab

A collaborative DOCX editor that records every edit and shows who changed what, and when: a timeline per topic, time travel to any moment, and model-written summaries of the edits you select. Built on SuperDoc for its take-home brief ([`docs/brief/`](docs/brief/superdoc-eng-sample-project.docx)).

**Live demo:** <https://superdoc.dhyegocalota.com.br>. Accounts are by invitation: sign in as `ana@example.com` with the password from the delivery message, and open a second browser as `bruno@example.com` to edit together.

![Ana types two paragraphs, an AI client connected through OAuth inserts one and rewrites another, tracked changes signed Ana · AI appear, a hatched layer joins the timeline, and Connected apps lists the client](docs/media/readme/ai-edit.gif)

An AI client connected through OAuth edits the document through MCP tools, as tracked changes the person can accept or reject. The timeline attributes its edits as the agent, a hatched layer with an AI mark beside the human bands, as the [agentic history spec](docs/features/agentic-history-mcp/spec.md) describes.

## Features

**Edit together**

- Live DOCX editing in SuperDoc: cursors, one colour per author, a jump to any member's cursor, the caret in the page on open.
- Upload or drop a `.docx`, or start blank; rename, and download as DOCX or PDF. The home shows documents as cards or a table.
- Sharing by an edit link and a read-only link the owner rotates; removing a member closes their sockets at once.
- Connection state on screen: lost, reconnecting, recovered. Offline edits are kept, and leaving with unsynced ones asks first.

**See the history**

- Every edit recorded on the server with its author, tracked changes in an uploaded file included.
- A streamgraph of edit volume per topic, or per author before topics exist, with idle stretches collapsed into marked breaks.
- One filter box, text or `@person`, narrowing the chart, the list and the highlights, kept in the URL.
- Top edits per topic: the contributors, the word delta and one sentence written by the model.
- Time travel: click or scrub to open a read-only version, or open the version right after any edit.
- Summarize edits with AI: one to three sentences about exactly the current selection, streamed word by word and cached for every member.

**AI clients**

- A remote MCP server behind OAuth: an AI client reads the history, edits in tracked mode, exports and shares as the person who authorized it. Its edits are signed "Name · AI", and the person revokes it under Connected apps.

**Accounts and running it**

- Invite only: the first sign-up claims the instance as admin, who hands out single-use invites and password reset links; no email needed.
- A showcase document with five days of edits by four authors, so the first timeline is full.
- Dark theme, a time zone preference, and layouts from a 320 px phone to a wide screen.
- One Docker image, one Node process, SQLite; the demo runs on Railway.

Every feature in detail, with its limits: [Architecture, features and limits](docs/architecture.md#features).

## Quick install

**With an agent.** Paste this into Claude Code, Codex or any agent with a shell; it asks you one question, installs, and stops where only you can continue:

```text
Install https://github.com/dhyegocalota/superdoc-collab by following docs/agent-install.md in that repository.
```

**With Docker**, as a local demo with seeded users:

```bash
ENV_FILE=../.env.example APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=true docker compose -f docker/docker-compose.local.yml up --build -d
```

Open <http://localhost:3000> and sign in as `ana@example.com` / `superdoc-demo`. The demo users are Ana, Bruno, Caio and Dani at `example.com`, all with that password. `docker compose -f docker/docker-compose.local.yml down -v` resets everything. Topics and summaries need `OPENROUTER_API_KEY`; without it the app works and the chart shows one band per author.

A sample document with five days of edits by four authors, "SuperDoc Collab: a guided tour", appears for the first admin who claims an instance, and Admin → Users has a Create the showcase document button to add another.

Railway, running from source, configuration and recovery: [Install and run](docs/install.md).

## Read more

- [Install and run](docs/install.md): Docker, Railway or an agent, then claim the instance and invite your team; [develop with an agent](docs/install.md#develop-with-an-agent)
- [Architecture, features and limits](docs/architecture.md)
- [Where it goes next](docs/next.md): how it scales, the integrations and the product ahead
- [Decisions](docs/adr/) and [features](docs/features/README.md#roadmap), one folder and one pull request each
- [Why there are no comments](docs/why-no-comments.md): where the why lives instead
- [How the work is done](.claude/HARNESS.md) with Claude Code, and the [credits](docs/credits.md)

## License

[GNU AGPL-3.0](LICENSE), the same licence as SuperDoc and its SDK. Copyright 2026 Dhyego Calota.
