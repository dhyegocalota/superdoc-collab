import { groupIntoRuns, summariesOutputSchema, type EditRun } from '@superdoc-collab/history';
import { HOUR_MS, UTC_TIME_ZONE, type TopicSummaries } from '@superdoc-collab/types';
import { describeError } from '../logging/describe-error';
import type { TimelinePipeline } from '../history/timeline-pipeline-cache';
import type { InsightsRepository, StoredTopic } from './insights-repository';
import type { InsightsJobRunner } from './insights-job-runner';
import { LanguageModelAvailability, generateStructured, type LanguageModelChoice } from './llm-client';
import { authorLabel, promptEditsOf, SUMMARIES_SYSTEM_PROMPT, summariesPrompt, type PromptTopic } from './prompts';

export const SUMMARIES_BUSY_MESSAGE = 'Skipped summarizing topics, the language model is busy, for document';
export const SUMMARIES_FAILED_MESSAGE = 'Summarizing topics failed for document';
const SUMMARY_RUN_BIN_MS = HOUR_MS;

type StaleTopic = { topic: StoredTopic; runs: EditRun[] };

export class SummariesService {
  private readonly repository: InsightsRepository;
  private readonly languageModel: LanguageModelChoice;
  private readonly jobRunner: InsightsJobRunner;
  private readonly readPipeline: (documentId: string) => TimelinePipeline;

  constructor({
    repository,
    languageModel,
    jobRunner,
    readPipeline,
  }: {
    repository: InsightsRepository;
    languageModel: LanguageModelChoice;
    jobRunner: InsightsJobRunner;
    readPipeline: (documentId: string) => TimelinePipeline;
  }) {
    this.repository = repository;
    this.languageModel = languageModel;
    this.jobRunner = jobRunner;
    this.readPipeline = readPipeline;
  }

  read(documentId: string): TopicSummaries {
    return { summaries: this.repository.summaries(documentId) };
  }

  isStale(documentId: string): boolean {
    return this.staleTopics(documentId).stale.length > 0;
  }

  // NB ADR 0031: a sentence is rewritten only when it is older than the topic set it was written for.
  async rewriteStale(documentId: string): Promise<void> {
    const { stale, pipeline, topicSetSequence } = this.staleTopics(documentId);
    if (stale.length === 0 || topicSetSequence === null) return;
    await this.summarize({ documentId, stale, pipeline, computedAtSequence: topicSetSequence });
  }

  private staleTopics(documentId: string): { stale: StaleTopic[]; pipeline: TimelinePipeline; topicSetSequence: number | null } {
    const topics = this.repository.topics(documentId);
    const pipeline = this.readPipeline(documentId);
    const status = this.repository.status(documentId);
    const topicSetSequence = status === null ? null : status.computedAtSequence;
    const topicIds = new Set(topics.map((topic) => topic.id));
    // NB ADR 0024: runs only bound the prompt size here, so the zone does not change what the sentences say.
    const runs = groupIntoRuns({
      events: pipeline.events.filter((event) => topicIds.has(event.bandId)),
      binMs: SUMMARY_RUN_BIN_MS,
      timeZone: UTC_TIME_ZONE,
    });
    const summarized = new Map(this.repository.summaries(documentId).map((summary) => [summary.topicId, summary.computedAtSequence]));
    const stale = topics
      .map((topic) => ({ topic, runs: runs.filter((run) => run.bandId === topic.id) }))
      .filter(({ topic, runs: topicRuns }) => {
        if (topicRuns.length === 0) return false;
        const computedAt = summarized.get(topic.id);
        return computedAt === undefined || (topicSetSequence !== null && computedAt < topicSetSequence);
      });
    return { stale, pipeline, topicSetSequence };
  }

  private promptTopics({ stale, pipeline }: { stale: StaleTopic[]; pipeline: TimelinePipeline }): PromptTopic[] {
    return stale.map(({ topic, runs }) => ({
      id: topic.id,
      name: topic.name,
      edits: promptEditsOf({ runs, authors: pipeline.authors }).map((edit) => ({
        author: authorLabel(edit),
        inserted: edit.inserted,
        deleted: edit.deleted,
      })),
    }));
  }

  private async summarize({
    documentId,
    stale,
    pipeline,
    computedAtSequence,
  }: {
    documentId: string;
    stale: StaleTopic[];
    pipeline: TimelinePipeline;
    computedAtSequence: number;
  }): Promise<void> {
    if (this.languageModel.availability === LanguageModelAvailability.Unavailable) return;
    if (!this.jobRunner.consumeDocumentCall(documentId)) {
      console.warn(`${SUMMARIES_BUSY_MESSAGE} ${documentId}`);
      return;
    }
    try {
      const output = await generateStructured({
        model: this.languageModel.model,
        schema: summariesOutputSchema,
        system: SUMMARIES_SYSTEM_PROMPT,
        prompt: summariesPrompt(this.promptTopics({ stale, pipeline })),
      });
      const knownIds = new Set(stale.map(({ topic }) => topic.id));
      this.repository.saveSummaries({ summaries: output.summaries.filter((summary) => knownIds.has(summary.topicId)), computedAtSequence });
    } catch (error) {
      console.error(`${SUMMARIES_FAILED_MESSAGE} ${documentId}: ${describeError(error)}`);
    }
  }
}
