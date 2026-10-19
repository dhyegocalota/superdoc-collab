import type { LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { LanguageModelAvailability, type LanguageModelChoice } from '../insights/llm-client';

const STOP = { unified: 'stop' as const, raw: undefined };
const NO_USAGE = { inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 0, text: 0, reasoning: 0 } };
const TEXT_PART_ID = 'text';

type StreamPart = Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'] extends ReadableStream<infer Part> ? Part : never;
type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;
type GenerateOptions = Parameters<MockLanguageModelV4['doGenerate']>[0];

function generateResult(answer: unknown) {
  return {
    content: [{ type: 'text' as const, text: typeof answer === 'string' ? answer : JSON.stringify(answer) }],
    finishReason: STOP,
    usage: NO_USAGE,
    warnings: [],
  };
}

function textStream({
  pieces,
  heldAfter = pieces.length,
  gate = Promise.resolve(),
  error = null,
}: {
  pieces: string[];
  heldAfter?: number;
  gate?: Promise<void>;
  error?: Error | null;
}): ReadableStream<StreamPart> {
  return new ReadableStream<StreamPart>({
    async start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] });
      controller.enqueue({ type: 'text-start', id: TEXT_PART_ID });
      await pieces.reduce(async (previous, delta, index) => {
        await previous;
        if (index === heldAfter) await gate;
        controller.enqueue({ type: 'text-delta', id: TEXT_PART_ID, delta });
      }, Promise.resolve());
      if (error) controller.enqueue({ type: 'error', error });
      controller.enqueue({ type: 'text-end', id: TEXT_PART_ID });
      controller.enqueue({ type: 'finish', finishReason: STOP, usage: NO_USAGE });
      controller.close();
    },
  });
}

function replayedAsStream(result: GenerateResult): { stream: ReadableStream<StreamPart> } {
  return { stream: textStream({ pieces: result.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])) }) };
}

function mockModel(doGenerate: MockLanguageModelV4['doGenerate'] | GenerateResult[]): MockLanguageModelV4 {
  const model: MockLanguageModelV4 = new MockLanguageModelV4({
    doGenerate,
    doStream: async (options) => replayedAsStream(await model.doGenerate(options)),
  });
  return model;
}

export function modelAnswering(...answers: unknown[]): MockLanguageModelV4 {
  return mockModel(answers.map(generateResult));
}

export function modelAnsweringWith(answer: () => unknown): MockLanguageModelV4 {
  return mockModel(async () => generateResult(answer()));
}

export function modelResponding(respond: (options: GenerateOptions) => unknown): MockLanguageModelV4 {
  return mockModel(async (options) => generateResult(await respond(options)));
}

export function gatedModel({ gate, answer }: { gate: Promise<void>; answer: unknown }): MockLanguageModelV4 {
  return mockModel(async () => {
    await gate;
    return generateResult(answer);
  });
}

export function failingModel(error: Error): MockLanguageModelV4 {
  return mockModel(async () => {
    throw error;
  });
}

export function streamingModel(script: {
  pieces: string[];
  heldAfter?: number;
  gate?: Promise<void>;
  error?: Error | null;
}): MockLanguageModelV4 {
  return new MockLanguageModelV4({ doStream: async () => ({ stream: textStream(script) }) });
}

export function readyModel(model: LanguageModel): LanguageModelChoice {
  return { availability: LanguageModelAvailability.Ready, model };
}
