# Summaries in en-US

**Status:** Building
**Tier:** 🟢
**Owner approval:** approved 2026-10-19 (the owner's instruction: summary edits always in en-US)
**ADRs:** none; [ADR 0024](../../adr/0024-times-follow-the-readers-zone-storage-stays-epoch.md) already pins the app's copy and locale to `en-US`
**Not changing:** the topic names (still in the document's language, as the topics prompt says), the prompt budgets, the schemas, the streaming, the card, the fake models of the tests

## Problem

The two summary prompts (`SUMMARIES_SYSTEM_PROMPT` for the topic summaries and `SELECTION_SYSTEM_PROMPT` for "Summarize edits with AI") tell the model to write in the language of the edited text. A document written in Portuguese gets Portuguese sentences inside an app whose every other string is English. The owner wants the summaries of edits in en-US whatever the document's language.

## Change

- One rule shared by both summary prompts replaces the language-of-the-text rule: write in English (en-US), whatever the language of the edited text.
- The plan of `llm-insights` that quotes the selection prompt follows.

## Test list

- Unit: both summary prompts carry the en-US rule and neither carries the language-of-the-text rule; the topics prompt still names topics in the document's language.
- Real model (tester, with the server's `OPENROUTER_API_KEY`): a Portuguese selection and Portuguese topic edits come back as English sentences naming the people sent.
- Real model, in the browser: Ana types a Portuguese paragraph and presses "Summarize edits with AI"; the card shows an English sentence.
