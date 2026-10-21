# Test plan: cleanup docs

No product behaviour changes. The proof is mechanical:

- [x] `apps/server/src/repository-shape/delivery-docs.test.ts`: every README's relative links resolve, every workspace package and `e2e/` has a README.
- [x] `.agents/hooks/hooks.test.sh`: the Stop hook still resolves the nearest README.
- [x] `pnpm format:check` and `pnpm typecheck` green.
- [x] A search for Markdown links into the removed proof-of-concept folder finds none.
- [x] The README screenshot opens and shows two authors, four topic bands and the top edits per topic.
