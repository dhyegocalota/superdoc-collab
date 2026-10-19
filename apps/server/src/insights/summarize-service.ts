import { secondsRoundedUp, SummarizeOutcome, SummarizeScope, SummarizeStep, TopicState } from '@superdoc-collab/types';
import { JobOutcome, type InsightsJobRunner } from './insights-job-runner';
import { LanguageModelAvailability, type LanguageModelChoice } from './llm-client';
import type { RequestedSelection, SelectionSummariesService } from './selection-summaries-service';
import type { SummariesService } from './summaries-service';
import type { TopicsService } from './topics-service';

export enum SummarizeRefusal {
  Busy = 'busy',
  Unavailable = 'unavailable',
}

type SummarizeResult =
  | { outcome: SummarizeOutcome }
  | { outcome: SummarizeRefusal.Busy; retryAfterSeconds: number }
  | { outcome: SummarizeRefusal.Unavailable; reason: string };

type SummarizeRequest = { documentId: string; selection: RequestedSelection };

function summarizeKey(documentId: string): string {
  return `summarize:${documentId}`;
}

function summarizeTopicsKey(documentId: string): string {
  return `summarize-topics:${documentId}`;
}

export class SummarizeService {
  private readonly topics: TopicsService;
  private readonly summaries: SummariesService;
  private readonly selection: SelectionSummariesService;
  private readonly jobRunner: InsightsJobRunner;
  private readonly languageModel: LanguageModelChoice;

  constructor({
    topics,
    summaries,
    selection,
    jobRunner,
    languageModel,
  }: {
    topics: TopicsService;
    summaries: SummariesService;
    selection: SelectionSummariesService;
    jobRunner: InsightsJobRunner;
    languageModel: LanguageModelChoice;
  }) {
    this.topics = topics;
    this.summaries = summaries;
    this.selection = selection;
    this.jobRunner = jobRunner;
    this.languageModel = languageModel;
  }

  // NB ADR 0031: a step runs only when it is stale, so a click on fresh work makes no model call.
  request({ documentId, selection, scope = SummarizeScope.Full }: SummarizeRequest & { scope?: SummarizeScope }): SummarizeResult {
    if (this.languageModel.availability === LanguageModelAvailability.Unavailable)
      return { outcome: SummarizeRefusal.Unavailable, reason: this.languageModel.reason };
    const key = summarizeKey(documentId);
    if (this.jobRunner.isRunning(key)) return { outcome: SummarizeOutcome.Running };
    const isFull = scope === SummarizeScope.Full;
    const isTopicWorkRunning = this.jobRunner.isRunning(summarizeTopicsKey(documentId));
    const needsTopicWork = isFull && !isTopicWorkRunning;
    const needsRegroup = needsTopicWork && this.topics.isStale(documentId);
    const needsSentences = needsTopicWork && this.summaries.isStale(documentId);
    const isAnythingStale = needsRegroup || this.selection.isStale({ documentId, selection }) || needsSentences;
    if (!isAnythingStale) return { outcome: SummarizeOutcome.UpToDate };
    const cooldownRemainingMs = this.selection.cooldown.remainingMs(documentId);
    const isWaiting = cooldownRemainingMs > 0 || !this.jobRunner.hasCallBudget();
    if (isWaiting) return this.busy(cooldownRemainingMs);
    const isRegroupFirst = needsRegroup && selection.topic !== null;
    const outcome = this.jobRunner.run({ key, job: () => this.run({ documentId, selection, isRegroupFirst }) });
    if (outcome === JobOutcome.Busy) return this.busy(cooldownRemainingMs);
    if (isRegroupFirst) void this.jobRunner.settled(key).then(() => this.startSentenceRewrite({ documentId, isFull }));
    if (!isRegroupFirst) this.startTopicWork({ documentId, needsRegroup, isFull });
    return { outcome: SummarizeOutcome.Started };
  }

  private busy(cooldownRemainingMs: number): SummarizeResult {
    const waitMs = Math.max(cooldownRemainingMs, this.jobRunner.retryAfterMs());
    return { outcome: SummarizeRefusal.Busy, retryAfterSeconds: secondsRoundedUp(waitMs) };
  }

  private async regroup(documentId: string): Promise<boolean> {
    await this.topics.regroup(documentId);
    const hasFailed = this.topics.status(documentId).state === TopicState.Failed;
    if (hasFailed) this.selection.markGroupingFailed(documentId);
    return hasFailed;
  }

  private async publishSentence({ documentId, selection }: SummarizeRequest): Promise<void> {
    this.selection.setStep({ documentId, step: SummarizeStep.Summarizing });
    await this.selection.write({ documentId, selection });
    this.selection.setStep({ documentId, step: SummarizeStep.Idle });
  }

  private startSentenceRewrite({ documentId, isFull }: { documentId: string; isFull: boolean }): void {
    if (this.topics.status(documentId).state === TopicState.Failed) return;
    this.startTopicWork({ documentId, needsRegroup: false, isFull });
  }

  // NB ADR 0041: the topics and their sentences run under their own key, so the step ends and the job is released when the sentence is saved.
  private startTopicWork({ documentId, needsRegroup, isFull }: { documentId: string; needsRegroup: boolean; isFull: boolean }): void {
    const needsSentences = isFull && this.summaries.isStale(documentId);
    if (!needsRegroup && !needsSentences) return;
    const outcome = this.jobRunner.run({
      key: summarizeTopicsKey(documentId),
      job: () => this.rewriteTopics({ documentId, needsRegroup, isFull }),
    });
    if (outcome === JobOutcome.Busy && needsRegroup) this.selection.markGroupingFailed(documentId);
  }

  private async rewriteTopics({ documentId, needsRegroup, isFull }: { documentId: string; needsRegroup: boolean; isFull: boolean }) {
    const stopWatching = this.jobRunner.watchFirstCall({ documentId, onFirstCall: () => this.selection.cooldown.start(documentId) });
    try {
      if (needsRegroup) await this.regroup(documentId);
      if (isFull) await this.summaries.rewriteStale(documentId);
    } finally {
      stopWatching();
    }
  }

  private async run({ documentId, selection, isRegroupFirst }: SummarizeRequest & { isRegroupFirst: boolean }): Promise<void> {
    const stopWatching = this.jobRunner.watchFirstCall({ documentId, onFirstCall: () => this.selection.cooldown.start(documentId) });
    this.selection.clearGroupingFailure(documentId);
    try {
      if (isRegroupFirst) this.selection.setStep({ documentId, step: SummarizeStep.Grouping });
      const hasRegroupFailed = isRegroupFirst && (await this.regroup(documentId));
      if (hasRegroupFailed) return;
      await this.publishSentence({ documentId, selection });
    } finally {
      stopWatching();
      this.selection.setStep({ documentId, step: SummarizeStep.Idle });
    }
  }
}
