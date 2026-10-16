# AI SDK 7 deprecates `generateObject`; structured output is `generateText` + `Output.object`

- Date: 2026-10-16
- Inspired by: slice 3 Task 5 (`apps/server/src/insights/llm-client.ts`), ADR 0006 addendum
- Revisited: 2026-10-16 — the mock is `MockLanguageModelV4` from `ai/test`

## Signal
`generateObject` is marked deprecated in `ai@7` and the OpenRouter provider answers `json_schema` requests through the text path; examples found online still show the old call.

## Cause
AI SDK 7 moved structured output into `generateText({ output: Output.object({ schema }) })`; the zod schema is sent as `response_format` and the parsed object comes back as `result.output`.

## Do
Use `generateText` + `Output.object` with a bounded zod schema, validate the output again in code (known ids, caps) and test with `MockLanguageModelV4`; keep one real smoke behind the key.

## Anchor
`apps/server/src/insights/llm-client.ts`, `topics-llm.smoke.test.ts`
