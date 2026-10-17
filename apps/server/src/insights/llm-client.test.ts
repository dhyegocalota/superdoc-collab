import { expect, test } from 'vitest';
import { chooseLanguageModel, LanguageModelAvailability, LLM_KEY_MISSING_MESSAGE, LLM_MODEL_MISSING_MESSAGE } from './llm-client';

const MODEL_ID = 'vendor/model';
const UNAVAILABLE_PREFIX = 'The language model is unavailable:';

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

test('the unavailable reasons name the language model, not one feature', () => {
  [LLM_MODEL_MISSING_MESSAGE, LLM_KEY_MISSING_MESSAGE].forEach((message) => expect(message.startsWith(UNAVAILABLE_PREFIX)).toBe(true));
});
