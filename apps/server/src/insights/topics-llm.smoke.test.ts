import { MAX_TOPICS_ACCEPTED, topicsOutputSchema } from '@superdoc-collab/history';
import { expect, test } from 'vitest';
import { loadLlmSettings } from '../config/environment';
import { generateStructured, chooseLanguageModel, LanguageModelAvailability } from './llm-client';
import { TOPICS_SYSTEM_PROMPT, topicsPrompt } from './prompts';

const SEED_BLOCKS = 50;
const SMOKE_TIMEOUT_MS = 60_000;
const SUBJECTS = ['budget', 'hiring', 'launch schedule', 'customer support', 'security review'];

const blocks = Array.from({ length: SEED_BLOCKS }, (_, index) => ({
  blockId: `b${index}`,
  text: `Note ${index} about the ${SUBJECTS[index % SUBJECTS.length]}: the team agreed on the next step and wrote it down.`,
  mergedIntoBlockId: null,
}));

test.skipIf(!process.env.OPENROUTER_API_KEY)(
  'the real model names the topics of the seed document',
  { timeout: SMOKE_TIMEOUT_MS },
  async () => {
    const choice = chooseLanguageModel(loadLlmSettings(process.env));
    expect(choice.availability).toBe(LanguageModelAvailability.Ready);
    if (choice.availability !== LanguageModelAvailability.Ready) return;
    const output = await generateStructured({
      model: choice.model,
      schema: topicsOutputSchema,
      system: TOPICS_SYSTEM_PROMPT,
      prompt: topicsPrompt(blocks),
    });
    const known = new Set(blocks.map((block) => block.blockId));
    expect(output.topics.length).toBeGreaterThan(0);
    expect(output.topics.length).toBeLessThanOrEqual(MAX_TOPICS_ACCEPTED);
    expect(output.topics.flatMap((topic) => topic.blockIds).every((blockId) => known.has(blockId))).toBe(true);
  },
);
