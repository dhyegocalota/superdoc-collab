import { SELECTION_SUMMARY_MAX_CHARACTERS } from '@superdoc-history/types';
import { z } from 'zod';

export const MIN_TOPICS = 4;
export const MAX_TOPICS = 8;
export const MAX_TOPICS_ACCEPTED = 20;
export const TOPIC_NAME_MAX_LENGTH = 40;
export const SUMMARY_SENTENCE_MAX_LENGTH = 200;
export const DUPLICATE_TOPIC_NAMES_MESSAGE = 'Topic names must be unique.';

const topicSchema = z.object({ name: z.string().trim().min(1).max(TOPIC_NAME_MAX_LENGTH), blockIds: z.array(z.string().min(1)).min(1) });

export const topicsOutputSchema = z
  .object({ topics: z.array(topicSchema).min(1).max(MAX_TOPICS_ACCEPTED) })
  .refine((output) => new Set(output.topics.map((topic) => topic.name.toLocaleLowerCase())).size === output.topics.length, { message: DUPLICATE_TOPIC_NAMES_MESSAGE });

export const summariesOutputSchema = z.object({ summaries: z.array(z.object({ topicId: z.string().min(1), sentence: z.string().trim().min(1).max(SUMMARY_SENTENCE_MAX_LENGTH) })) });

export const selectionSummaryOutputSchema = z.object({ sentence: z.string().trim().min(1).max(SELECTION_SUMMARY_MAX_CHARACTERS), authors: z.array(z.string().trim().min(1)) });

export type TopicsOutput = z.infer<typeof topicsOutputSchema>;
export type SummariesOutput = z.infer<typeof summariesOutputSchema>;
export type SelectionSummaryOutput = z.infer<typeof selectionSummaryOutputSchema>;
