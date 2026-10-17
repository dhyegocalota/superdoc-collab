import type { LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { LanguageModelAvailability, type LanguageModelChoice } from '../insights/llm-client';

const STOP = { unified: 'stop' as const, raw: undefined };
const NO_USAGE = { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } };

function generateResult(answer: unknown) {
  return { content: [{ type: 'text' as const, text: typeof answer === 'string' ? answer : JSON.stringify(answer) }], finishReason: STOP, usage: NO_USAGE, warnings: [] };
}

export function modelAnswering(...answers: unknown[]): MockLanguageModelV4 {
  return new MockLanguageModelV4({ doGenerate: answers.map(generateResult) });
}

export function modelAnsweringWith(answer: () => unknown): MockLanguageModelV4 {
  return new MockLanguageModelV4({ doGenerate: async () => generateResult(answer()) });
}

export function gatedModel({ gate, answer }: { gate: Promise<void>; answer: unknown }): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      await gate;
      return generateResult(answer);
    },
  });
}

export function failingModel(error: Error): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      throw error;
    },
  });
}

export function readyModel(model: LanguageModel): LanguageModelChoice {
  return { availability: LanguageModelAvailability.Ready, model };
}
