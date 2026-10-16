import { createOpenRouter, type OpenRouterProviderSettings } from '@openrouter/ai-sdk-provider';
import { SECOND_MS } from '@superdoc-history/types';
import { generateText, Output, type LanguageModel } from 'ai';
import type { z } from 'zod';
import type { LlmSettings } from '../config/environment';

export const LLM_MODEL_MISSING_MESSAGE = 'Topics are unavailable: LLM_MODEL is not set on the server.';
export const LLM_BUSY_MESSAGE = 'The language model is busy; try again later.';
export const LLM_KEY_MISSING_MESSAGE = 'Topics are unavailable: OPENROUTER_API_KEY is not set on the server.';
const LLM_TIMEOUT_MS = 30 * SECOND_MS;
const LLM_MAX_RETRIES = 1;

export enum LanguageModelAvailability {
  Ready = 'ready',
  Unavailable = 'unavailable',
}

export type LanguageModelChoice = { availability: LanguageModelAvailability.Ready; model: LanguageModel } | { availability: LanguageModelAvailability.Unavailable; reason: string };

function providerSettings({ apiKey, baseUrl }: { apiKey: string; baseUrl: string | null }): OpenRouterProviderSettings {
  if (!baseUrl) return { apiKey };
  return { apiKey, baseURL: baseUrl };
}

export function chooseLanguageModel({ model, apiKey, baseUrl }: LlmSettings): LanguageModelChoice {
  if (!model) return { availability: LanguageModelAvailability.Unavailable, reason: LLM_MODEL_MISSING_MESSAGE };
  if (!apiKey) return { availability: LanguageModelAvailability.Unavailable, reason: LLM_KEY_MISSING_MESSAGE };
  return { availability: LanguageModelAvailability.Ready, model: createOpenRouter(providerSettings({ apiKey, baseUrl })).chat(model) };
}

export async function generateStructured<Schema extends z.ZodType>({ model, schema, system, prompt }: { model: LanguageModel; schema: Schema; system: string; prompt: string }): Promise<z.infer<Schema>> {
  const { output } = await generateText({ model, output: Output.object<z.infer<Schema>>({ schema }), system, prompt, maxRetries: LLM_MAX_RETRIES, abortSignal: AbortSignal.timeout(LLM_TIMEOUT_MS) });
  return output;
}
