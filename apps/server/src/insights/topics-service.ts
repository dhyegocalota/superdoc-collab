import { matchPreviousTopics, normalizeTopics, topicsOutputSchema } from '@superdoc-history/history';
import { MINUTE_MS, SECOND_MS, TOPIC_RECOMPUTE_NEW_BLOCKS, TOPICS_FAILED_MESSAGE, TopicState, type TopicStatus } from '@superdoc-history/types';
import type { LanguageModel } from 'ai';
import type { ProjectionScheduler } from '../history/projection-scheduler';
import { describeError } from '../history/projection-messages';
import { DocumentCooldown } from './document-cooldown';
import type { InsightsRepository } from './insights-repository';
import { JobOutcome, type InsightsWorker } from './insights-worker';
import { LanguageModelAvailability, LLM_BUSY_MESSAGE, generateStructured, type LanguageModelChoice } from './llm-client';
import { TOPICS_SYSTEM_PROMPT, topicsPrompt } from './prompts';

export const UNKNOWN_TOPIC_BLOCKS_MESSAGE = 'The model named block ids that are not in the document, for document';
export const TOPICS_COMPUTE_FAILED_MESSAGE = 'Naming topics failed for document';
export const TOPIC_RECOMPUTE_MIN_INTERVAL_MS = MINUTE_MS;
export const TOPIC_REFRESH_COOLDOWN_MS = 30 * SECOND_MS;

class LanguageModelBusyError extends Error {}

export enum RefreshOutcome {
  Started = 'started',
  AlreadyRunning = 'already-running',
  TooSoon = 'too-soon',
}

export type RefreshResult = { outcome: RefreshOutcome.Started | RefreshOutcome.AlreadyRunning } | { outcome: RefreshOutcome.TooSoon; retryAfterSeconds: number };

function topicsKey(documentId: string): string {
  return `topics:${documentId}`;
}

export class TopicsService {
  private readonly repository: InsightsRepository;
  private readonly scheduler: ProjectionScheduler;
  private readonly languageModel: LanguageModelChoice;
  private readonly worker: InsightsWorker;
  readonly cooldown = new DocumentCooldown({ durationMs: TOPIC_REFRESH_COOLDOWN_MS });

  constructor({ repository, scheduler, languageModel, worker }: { repository: InsightsRepository; scheduler: ProjectionScheduler; languageModel: LanguageModelChoice; worker: InsightsWorker }) {
    this.repository = repository;
    this.scheduler = scheduler;
    this.languageModel = languageModel;
    this.worker = worker;
  }

  status(documentId: string): TopicStatus {
    const stored = this.repository.status(documentId);
    if (stored) return stored;
    return { state: TopicState.Pending, failure: null, computedAtSequence: null };
  }

  ensure(documentId: string): void {
    if (this.repository.status(documentId) !== null) return;
    this.start({ documentId, isRefresh: false });
  }

  refresh(documentId: string): RefreshResult {
    if (this.worker.isRunning(topicsKey(documentId))) return { outcome: RefreshOutcome.AlreadyRunning };
    const remainingMs = this.cooldown.remainingMs(documentId);
    if (remainingMs > 0) return { outcome: RefreshOutcome.TooSoon, retryAfterSeconds: Math.ceil(remainingMs / SECOND_MS) };
    this.start({ documentId, isRefresh: true });
    return { outcome: RefreshOutcome.Started };
  }

  forget(documentId: string): void {
    this.cooldown.forget(documentId);
  }

  onTimelineRead({ documentId, unassignedFirstSequences }: { documentId: string; unassignedFirstSequences: number[] }): void {
    const status = this.repository.status(documentId);
    const updatedAt = this.repository.updatedAt(documentId);
    if (!status || updatedAt === null) return;
    if (status.state !== TopicState.Ready) return;
    if (status.computedAtSequence === null) return;
    const computedAtSequence = status.computedAtSequence;
    if (unassignedFirstSequences.filter((sequence) => sequence > computedAtSequence).length < TOPIC_RECOMPUTE_NEW_BLOCKS) return;
    if (Date.now() - updatedAt < TOPIC_RECOMPUTE_MIN_INTERVAL_MS) return;
    this.start({ documentId, isRefresh: false });
  }

  private start({ documentId, isRefresh }: { documentId: string; isRefresh: boolean }): void {
    const outcome = this.worker.run({ key: topicsKey(documentId), job: () => this.compute({ documentId, isRefresh }) });
    if (outcome !== JobOutcome.Busy) return;
    if (this.keepsReadyTopics({ previous: this.repository.status(documentId), isRefresh })) return;
    this.repository.markFailed({ documentId, failure: LLM_BUSY_MESSAGE });
  }

  // NB ADR 0014: a busy automatic recompute keeps the ready topics; only a manual Refresh reports busy.
  private keepsReadyTopics({ previous, isRefresh }: { previous: TopicStatus | null; isRefresh: boolean }): boolean {
    return !isRefresh && previous !== null && previous.state === TopicState.Ready;
  }

  private settleBusy({ documentId, previous, isRefresh }: { documentId: string; previous: TopicStatus | null; isRefresh: boolean }): void {
    if (this.keepsReadyTopics({ previous, isRefresh })) return this.repository.restoreStatus({ documentId, previous });
    this.repository.markFailed({ documentId, failure: LLM_BUSY_MESSAGE });
  }

  private consumeCooldown({ documentId, isRefresh }: { documentId: string; isRefresh: boolean }): void {
    if (isRefresh) this.cooldown.start(documentId);
  }

  private async compute({ documentId, isRefresh }: { documentId: string; isRefresh: boolean }): Promise<void> {
    const choice = this.languageModel;
    if (choice.availability === LanguageModelAvailability.Unavailable) {
      this.consumeCooldown({ documentId, isRefresh });
      return this.repository.markFailed({ documentId, failure: choice.reason });
    }
    const previous = this.repository.status(documentId);
    this.repository.markPending(documentId);
    try {
      await this.recompute({ documentId, model: choice.model, previous, isRefresh });
    } catch (error) {
      if (error instanceof LanguageModelBusyError) return this.settleBusy({ documentId, previous, isRefresh });
      console.error(`${TOPICS_COMPUTE_FAILED_MESSAGE} ${documentId}: ${describeError(error)}`);
      this.repository.markFailed({ documentId, failure: TOPICS_FAILED_MESSAGE });
    }
  }

  private async recompute({ documentId, model, previous, isRefresh }: { documentId: string; model: LanguageModel; previous: TopicStatus | null; isRefresh: boolean }): Promise<void> {
    const { blocks, sequence } = await this.scheduler.blocks(documentId);
    if (blocks.every((block) => block.mergedIntoBlockId !== null)) return this.repository.restoreStatus({ documentId, previous });
    const named = blocks.filter((block) => block.mergedIntoBlockId === null && block.text.trim() !== '');
    if (named.length === 0) return this.repository.saveTopics({ documentId, topics: [], computedAtSequence: sequence });
    this.consumeCooldown({ documentId, isRefresh });
    if (!this.worker.consumeCall()) throw new LanguageModelBusyError();
    const output = await generateStructured({ model, schema: topicsOutputSchema, system: TOPICS_SYSTEM_PROMPT, prompt: topicsPrompt(named) });
    const normalized = normalizeTopics({ output, knownBlockIds: new Set(named.map((block) => block.blockId)) });
    if (normalized.unknownBlockIds.length > 0) console.warn(`${UNKNOWN_TOPIC_BLOCKS_MESSAGE} ${documentId}: ${normalized.unknownBlockIds.length}`);
    const topics = matchPreviousTopics({ previous: this.repository.topics(documentId), next: normalized.topics });
    this.repository.saveTopics({ documentId, topics, computedAtSequence: sequence });
  }
}
