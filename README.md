# SuperDoc Collab

A collaborative DOCX editor that records every edit and shows who changed what, and when: a timeline per topic, time travel to any moment, and model-written summaries of the edits you select. Built on SuperDoc for its take-home brief ([`docs/brief/`](docs/brief/superdoc-eng-sample-project.docx)).

**Live demo:** <https://superdoc-collab.up.railway.app>. Sign in as `ana@example.com` with the password from the delivery message, or create an account. Open a second browser as `bruno@example.com` to edit together.

![The editor beside the timeline panel: one band per topic, and the top edits per topic with who made them and one sentence each](docs/media/readme/timeline.png)

## Run it

```bash
ENV_FILE=.env.example APP_ORIGIN=http://localhost:3000 SEED_DEMO_USERS=true docker compose up --build -d
```

Open <http://localhost:3000> and sign in as `ana@example.com` / `superdoc-demo`. The demo users are Ana, Bruno, Caio and Dani at `example.com`, all with that password. `docker compose down -v` resets everything.

From source, with Node 24 and pnpm:

```bash
cp .env.example .env
pnpm install
pnpm build
scripts/with-env.sh pnpm seed
WEB_DIST_DIR=apps/web/dist scripts/with-env.sh pnpm --filter @superdoc-collab/server start
```

Topics and summaries need `OPENROUTER_API_KEY` in `.env`; without it the app works and the chart shows one band per author.

## Read more

- [Architecture, features and limits](docs/architecture.md)
- [Decisions](docs/adr/) and [features](docs/features/README.md#roadmap), one folder and one pull request each
- [How the work is done](.claude/HARNESS.md) with Claude Code, and the [credits](docs/credits.md)

## License

[GNU AGPL-3.0](LICENSE), the same licence as SuperDoc and its SDK. Copyright 2026 Dhyego Calota.
