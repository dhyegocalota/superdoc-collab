import { groupIntoRuns, summariesOutputSchema, type EditRun } from '@superdoc-history/history';
import { MINUTE_MS, type TopicSummaries } from '@superdoc-history/types';
import { describeError } from '../history/projection-messages';
import type { TimelinePipeline } from '../history/timeline-pipeline-cache';
import type { InsightsRepository, StoredTopic } from './insights-repository';
import { JobOutcome, type InsightsWorker } from './insights-worker';
import { LanguageModelAvailability, generateStructured, type LanguageModelChoice } from './llm-client';
import { SUMMARIES_SYSTEM_PROMPT, summariesPrompt, type PromptTopic } from './prompts';

export const SUMMARY_MIN_INTERVAL_MS = MINUTE_MS;
export const SUMMARIES_BUSY_MESSAGE = 'Skipped summarizing topics, the language model is busy, for document';
export const SUMMARIES_FAILED_MESSAGE = 'Summarizing topics failed for document';
const SUMMARY_RUN_BIN_MS = 60 * MINUTE_MS;

type StaleTopic = { topic: StoredTopic; runs: EditRun[] };

function summariesKey(documentId: string): string {
  return `summaries:${documentId}`;
}

export class SummariesService {
  private readonly repository: InsightsRepository;
  private readonly languageModel: LanguageModelChoice;
  private readonly worker: InsightsWorker;
  private readonly readPipeline: (documentId: string) => TimelinePipeline;
  private readonly lastRuns = new Map<string, number>();

  constructor({ repository, languageModel, worker, readPipeline }: { repository: InsightsRepository; languageModel: LanguageModelChoice; worker: InsightsWorker; readPipeline: (documentId: string) => TimelinePipeline }) {
    this.repository = repository;
    this.languageModel = languageModel;
    this.worker = worker;
    this.readPipeline = readPipeline;
  }

  read(documentId: string): TopicSummaries {
    return { summaries: this.repository.summaries(documentId) };
  }

  refreshStale(documentId: string): void {
    if (this.languageModel.availability === LanguageModelAvailability.Unavailable) return;
    if (this.worker.isRunning(summariesKey(documentId))) return;
    const last = this.lastRuns.get(documentId);
    if (last !== undefined && Date.now() - last < SUMMARY_MIN_INTERVAL_MS) return;
    const topics = this.repository.topics(documentId);
    if (topics.length === 0) return;
    const pipeline = this.readPipeline(documentId);
    const stale = this.staleTopics({ documentId, topics, pipeline });
    if (stale.length === 0) return;
    const computedAtSequence = pipeline.events.reduce((latest, event) => Math.max(latest, event.sequence), 0);
    this.lastRuns.set(documentId, Date.now());
    const outcome = this.worker.run({ key: summariesKey(documentId), job: () => this.summarize({ documentId, stale, pipeline, computedAtSequence }) });
    if (outcome !== JobOutcome.Busy) return;
    this.lastRuns.delete(documentId);
    console.warn(`${SUMMARIES_BUSY_MESSAGE} ${documentId}`);
  }

  private staleTopics({ documentId, topics, pipeline }: { documentId: string; topics: StoredTopic[]; pipeline: TimelinePipeline }): StaleTopic[] {
    const topicIds = new Set(topics.map((topic) => topic.id));
    const runs = groupIntoRuns({ events: pipeline.events.filter((event) => topicIds.has(event.bandId)), binMs: SUMMARY_RUN_BIN_MS });
    const summarized = new Map(this.repository.summaries(documentId).map((summary) => [summary.topicId, summary.computedAtSequence]));
    return topics
      .map((topic) => ({ topic, runs: runs.filter((run) => run.bandId === topic.id) }))
      .filter(({ topic, runs: topicRuns }) => {
        if (topicRuns.length === 0) return false;
        const computedAt = summarized.get(topic.id);
        return computedAt === undefined || topicRuns.reduce((latest, run) => Math.max(latest, run.lastSequence), 0) > computedAt;
      });
  }

  private promptTopics({ stale, pipeline }: { stale: StaleTopic[]; pipeline: TimelinePipeline }): PromptTopic[] {
    return stale.map(({ topic, runs }) => ({
      id: topic.id,
      name: topic.name,
      edits: [...runs]
        .sort((left, right) => right.lastServerTime - left.lastServerTime)
        .map((run) => ({ author: run.authorKeys.map((key) => pipeline.authors[key]!.name).join(', '), inserted: run.inserted, deleted: run.deleted })),
    }));
  }

  private async summarize({ documentId, stale, pipeline, computedAtSequence }: { documentId: string; stale: StaleTopic[]; pipeline: TimelinePipeline; computedAtSequence: number }): Promise<void> {
    const choice = this.languageModel;
    if (choice.availability === LanguageModelAvailability.Unavailable) return;
    try {
      const output = await generateStructured({ model: choice.model, schema: summariesOutputSchema, system: SUMMARIES_SYSTEM_PROMPT, prompt: summariesPrompt(this.promptTopics({ stale, pipeline })) });
      const knownIds = new Set(stale.map(({ topic }) => topic.id));
      this.repository.saveSummaries({ summaries: output.summaries.filter((summary) => knownIds.has(summary.topicId)), computedAtSequence });
    } catch (error) {
      console.error(`${SUMMARIES_FAILED_MESSAGE} ${documentId}: ${describeError(error)}`);
    }
  }
}
