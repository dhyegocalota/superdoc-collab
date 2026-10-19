import { expect, test } from 'vitest';
import { selectionSummaryOutputSchema } from '@superdoc-collab/history';
import { streamingModel } from '../testing/language-model';
import {
  chooseLanguageModel,
  LanguageModelAvailability,
  LanguageModelTimeoutError,
  LLM_KEY_MISSING_MESSAGE,
  LLM_MODEL_MISSING_MESSAGE,
  streamStructured,
} from './llm-client';

const MODEL_ID = 'vendor/model';
const SHORT_DEADLINE_MS = 20;

test('a missing model is unavailable with the model message', () => {
  expect(chooseLanguageModel({ model: null, apiKey: 'key', baseUrl: null })).toEqual({
    availability: LanguageModelAvailability.Unavailable,
    reason: LLM_MODEL_MISSING_MESSAGE,
  });
});

test('a model without a key is unavailable with the key message', () => {
  expect(chooseLanguageModel({ model: MODEL_ID, apiKey: null, baseUrl: null })).toEqual({
    availability: LanguageModelAvailability.Unavailable,
    reason: LLM_KEY_MISSING_MESSAGE,
  });
});

test.each([null, 'http://localhost:9000/v1'])('a model with a key is ready for base url %s', (baseUrl) => {
  const choice = chooseLanguageModel({ model: MODEL_ID, apiKey: 'key', baseUrl });
  expect(choice.availability).toBe(LanguageModelAvailability.Ready);
  if (choice.availability !== LanguageModelAvailability.Ready) return;
  expect(choice.model).toMatchObject({ modelId: MODEL_ID });
});

test('streamStructured rejects with a timeout error when the model is held past the deadline', async () => {
  const model = streamingModel({ pieces: ['{"sentence":"Ana'], heldAfter: 0, gate: new Promise<void>(() => undefined) });
  await expect(
    streamStructured({
      model,
      schema: selectionSummaryOutputSchema,
      system: 'system',
      prompt: 'prompt',
      onPartial: () => undefined,
      timeoutMs: SHORT_DEADLINE_MS,
    }),
  ).rejects.toBeInstanceOf(LanguageModelTimeoutError);
});

test('streamStructured hands each partial sentence to the callback and returns the final output', async () => {
  const model = streamingModel({ pieces: ['{"sentence":"Ana raised', ' the budget.","authors":["Ana"]}'] });
  const partials: (string | undefined)[] = [];
  const output = await streamStructured({
    model,
    schema: selectionSummaryOutputSchema,
    system: 'system',
    prompt: 'prompt',
    onPartial: ({ sentence }) => partials.push(sentence),
  });
  expect(partials).toContain('Ana raised');
  expect(output).toEqual({ sentence: 'Ana raised the budget.', authors: ['Ana'] });
});
