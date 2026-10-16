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
