import { matchPreviousTopics, normalizeTopics, topicsOutputSchema } from '@superdoc-collab/history';
import {
  isBlank,
  MINUTE_MS,
  TOPIC_RECOMPUTE_NEW_BLOCKS,
  TOPICS_FAILED_MESSAGE,
  TopicState,
  type TopicStatus,
} from '@superdoc-collab/types';
import type { LanguageModel } from 'ai';
import type { ProjectionScheduler } from '../history/projection-scheduler';
import type { TimelinePipeline } from '../history/timeline-pipeline-cache';
import { describeError } from '../logging/describe-error';
import type { InsightsRepository } from './insights-repository';
import { JobOutcome, type InsightsJobRunner } from './insights-job-runner';
import { lastSequenceOf } from './last-sequence';
import { LanguageModelAvailability, LLM_BUSY_MESSAGE, generateStructured, type LanguageModelChoice } from './llm-client';
import { TOPICS_SYSTEM_PROMPT, topicsPrompt } from './prompts';

export const UNKNOWN_TOPIC_BLOCKS_MESSAGE = 'The model named block ids that are not in the document, for document';
const TOPICS_COMPUTE_FAILED_MESSAGE = 'Naming topics failed for document';
export const TOPIC_RECOMPUTE_MIN_INTERVAL_MS = MINUTE_MS;

class LanguageModelBusyError extends Error {}

function topicsKey(documentId: string): string {
  return `topics:${documentId}`;
}

function newBlocksSince({ sequences, computedAtSequence }: { sequences: number[]; computedAtSequence: number }): number {
  return sequences.filter((sequence) => sequence > computedAtSequence).length;
}

export class TopicsService {
  private readonly repository: InsightsRepository;
  private readonly scheduler: ProjectionScheduler;
  private readonly languageModel: LanguageModelChoice;
  private readonly jobRunner: InsightsJobRunner;
  private readonly readPipeline: (documentId: string) => TimelinePipeline;

  constructor({
    repository,
    scheduler,
    languageModel,
    jobRunner,
    readPipeline,
  }: {
    repository: InsightsRepository;
    scheduler: ProjectionScheduler;
    languageModel: LanguageModelChoice;
    jobRunner: InsightsJobRunner;
    readPipeline: (documentId: string) => TimelinePipeline;
  }) {
    this.repository = repository;
    this.scheduler = scheduler;
    this.languageModel = languageModel;
    this.jobRunner = jobRunner;
    this.readPipeline = readPipeline;
  }

  status(documentId: string): TopicStatus {
    const stored = this.repository.status(documentId);
    if (stored) return stored;
    return { state: TopicState.Pending, failure: null, computedAtSequence: null };
  }

  ensure(documentId: string): void {
    if (this.repository.status(documentId) !== null) return;
    this.start({ documentId, isRegroup: false });
  }

  isStale(documentId: string): boolean {
    const status = this.repository.status(documentId);
    if (status === null || status.state === TopicState.Pending) return false;
    if (status.state === TopicState.Failed) return true;
    if (status.computedAtSequence === null) return false;
    return status.computedAtSequence < lastSequenceOf(this.readPipeline(documentId).events.map((event) => event.sequence));
  }

  async regroup(documentId: string): Promise<void> {
    const key = topicsKey(documentId);
    if (this.jobRunner.isRunning(key)) return this.jobRunner.settled(key);
    await this.compute({ documentId, isRegroup: true });
  }

  onTimelineRead(documentId: string): void {
    const status = this.repository.status(documentId);
    const updatedAt = this.repository.updatedAt(documentId);
    if (!status || updatedAt === null) return;
    if (status.state !== TopicState.Ready) return;
    if (status.computedAtSequence === null) return;
    const newBlocks = newBlocksSince({
      sequences: this.readPipeline(documentId).unassignedFirstSequences,
      computedAtSequence: status.computedAtSequence,
    });
    if (newBlocks < TOPIC_RECOMPUTE_NEW_BLOCKS) return;
    if (Date.now() - updatedAt < TOPIC_RECOMPUTE_MIN_INTERVAL_MS) return;
    this.start({ documentId, isRegroup: false });
  }

  private start({ documentId, isRegroup }: { documentId: string; isRegroup: boolean }): void {
    const outcome = this.jobRunner.run({ key: topicsKey(documentId), job: () => this.compute({ documentId, isRegroup }) });
    if (outcome !== JobOutcome.Busy) return;
    if (this.keepsReadyTopics({ previous: this.repository.status(documentId), isRegroup })) return;
    this.repository.markFailed({ documentId, failure: LLM_BUSY_MESSAGE });
  }

  // NB ADR 0015: a busy automatic recompute keeps ready topics; a Summarize regroup, or a first computation with nothing to keep, reports busy.
  private keepsReadyTopics({ previous, isRegroup }: { previous: TopicStatus | null; isRegroup: boolean }): boolean {
    return !isRegroup && previous !== null && previous.state === TopicState.Ready;
  }

  private settleBusy({ documentId, previous, isRegroup }: { documentId: string; previous: TopicStatus | null; isRegroup: boolean }): void {
    if (this.keepsReadyTopics({ previous, isRegroup })) return this.repository.restoreStatus({ documentId, previous });
    this.repository.markFailed({ documentId, failure: LLM_BUSY_MESSAGE });
  }

  private async compute({ documentId, isRegroup }: { documentId: string; isRegroup: boolean }): Promise<void> {
    if (this.languageModel.availability === LanguageModelAvailability.Unavailable)
      return this.repository.markFailed({ documentId, failure: this.languageModel.reason });
    const previous = this.repository.status(documentId);
    this.repository.markPending(documentId);
    try {
      await this.recompute({ documentId, model: this.languageModel.model, previous });
    } catch (error) {
      if (error instanceof LanguageModelBusyError) return this.settleBusy({ documentId, previous, isRegroup });
      console.error(`${TOPICS_COMPUTE_FAILED_MESSAGE} ${documentId}: ${describeError(error)}`);
      this.repository.markFailed({ documentId, failure: TOPICS_FAILED_MESSAGE });
    }
  }

  private async recompute({
    documentId,
    model,
    previous,
  }: {
    documentId: string;
    model: LanguageModel;
    previous: TopicStatus | null;
  }): Promise<void> {
    const { blocks, sequence } = await this.scheduler.blocks(documentId);
    if (blocks.every((block) => block.mergedIntoBlockId !== null)) return this.repository.restoreStatus({ documentId, previous });
    const blocksWithText = blocks.filter((block) => block.mergedIntoBlockId === null && !isBlank(block.text));
    if (blocksWithText.length === 0) return this.repository.saveTopics({ documentId, topics: [], computedAtSequence: sequence });
    if (!this.jobRunner.consumeDocumentCall(documentId)) throw new LanguageModelBusyError();
    const output = await generateStructured({
      model,
      schema: topicsOutputSchema,
      system: TOPICS_SYSTEM_PROMPT,
      prompt: topicsPrompt(blocksWithText),
    });
    const normalized = normalizeTopics({ output, knownBlockIds: new Set(blocksWithText.map((block) => block.blockId)) });
    if (normalized.unknownBlockIds.length > 0)
      console.warn(`${UNKNOWN_TOPIC_BLOCKS_MESSAGE} ${documentId}: ${normalized.unknownBlockIds.length}`);
    const topics = matchPreviousTopics({ previous: this.repository.topics(documentId), next: normalized.topics });
    this.repository.saveTopics({ documentId, topics, computedAtSequence: sequence });
  }
}
