# 0006. Call LLMs through the Vercel AI SDK

- Status: Accepted
- Date: 2026-10-16
- Deciders: Dhyego Calota (owner); Claude (advisor)
- Inspired by: take-home specification, [0004](0004-stack.md)

## Context

The spec forbids third-party managed services except LLM providers. The product needs batch topic clustering of edit windows and an on-demand "Summarize edits".

## Decision

- Use the `ai` library (provider-agnostic, open source, not a service) with the provider chosen by environment variable.
- Anthropic is the default: Haiku 5.5 for batch topic clustering of windows, Sonnet 5.5 for on-demand "Summarize edits".
- Topics use structured output with zod (`generateObject`).
- Prompt caching goes through the native provider.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Anthropic SDK direct | Full native feature access | Vendor lock; switching means rewriting | Provider must be swappable |
| OpenRouter | One key for many models | Managed intermediary; the spec's exception names "LLM providers", a gray zone; extra hop | Risks the no-managed-services rule |

## Consequences

- The README must cite LLM use.
- Tests mock the provider; no test calls a real model.
- Prompt caching depends on the selected provider's support.

## Evidence

- None from the POC; this decision is design-time.

## Revisit when

- The default provider's pricing or models change materially.
- The spec clarifies whether intermediaries count as LLM providers.

## Addendum 2026-10-16

Owner decision for slice 3: the provider behind the AI SDK is **OpenRouter** (`@openrouter/ai-sdk-provider`), model `openai/gpt-6-luna` (cheap), configured by `OPENROUTER_API_KEY` and `LLM_MODEL`. The earlier concern about OpenRouter being a managed intermediary is accepted by the owner: the brief's exception for LLM providers is read as covering an LLM gateway, and the README states it. Switching provider or model stays an environment change.

## Amendment 2026-10-18

The code differs from the Decision section in three ways, none of which changes the choice of the Vercel AI SDK:

- The provider is OpenRouter, as the addendum of 2026-10-16 says. The Anthropic defaults (Haiku 5.5 for topics, Sonnet 5.5 for Summarize) were never built; one model, `LLM_MODEL`, serves every call.
- Structured output goes through `generateText` with `Output.object` and a zod schema, not `generateObject`.
- The selection sentence goes through `streamText` with the same output schema, so the job can publish the partial sentence ([0041](0041-the-summary-card-shows-the-sentence-as-it-is-written.md)). Both calls share a 30 second deadline and one retry.
