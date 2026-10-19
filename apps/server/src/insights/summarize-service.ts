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
    const needsRegroup = isFull && this.topics.isStale(documentId);
    const needsSentences = isFull && this.summaries.isStale(documentId);
    const isAnythingStale = needsRegroup || this.selection.isStale({ documentId, selection }) || needsSentences;
    if (!isAnythingStale) return { outcome: SummarizeOutcome.UpToDate };
    const cooldownRemainingMs = this.selection.cooldown.remainingMs(documentId);
    const isWaiting = cooldownRemainingMs > 0 || !this.jobRunner.hasCallBudget();
    if (isWaiting) return this.busy(cooldownRemainingMs);
    const outcome = this.jobRunner.run({ key, job: () => this.run({ documentId, selection, needsRegroup, isFull }) });
    if (outcome === JobOutcome.Busy) return this.busy(cooldownRemainingMs);
    return { outcome: SummarizeOutcome.Started };
  }

  private busy(cooldownRemainingMs: number): SummarizeResult {
    const waitMs = Math.max(cooldownRemainingMs, this.jobRunner.retryAfterMs());
    return { outcome: SummarizeRefusal.Busy, retryAfterSeconds: secondsRoundedUp(waitMs) };
  }

  private async regroup(documentId: string): Promise<boolean> {
    this.selection.setStep({ documentId, step: SummarizeStep.Grouping });
    await this.topics.regroup(documentId);
    const hasFailed = this.topics.status(documentId).state === TopicState.Failed;
    if (hasFailed) this.selection.markGroupingFailed(documentId);
    return hasFailed;
  }

  private async run({
    documentId,
    selection,
    needsRegroup,
    isFull,
  }: SummarizeRequest & { needsRegroup: boolean; isFull: boolean }): Promise<void> {
    const stopWatching = this.jobRunner.watchFirstCall({ documentId, onFirstCall: () => this.selection.cooldown.start(documentId) });
    this.selection.clearGroupingFailure(documentId);
    try {
      const hasRegroupFailed = needsRegroup && (await this.regroup(documentId));
      const isTopicSelection = selection.topic !== null;
      if (hasRegroupFailed && isTopicSelection) return;
      this.selection.setStep({ documentId, step: SummarizeStep.Summarizing });
      await this.selection.write({ documentId, selection });
      if (isFull) await this.summaries.rewriteStale(documentId);
    } finally {
      stopWatching();
      this.selection.setStep({ documentId, step: SummarizeStep.Idle });
    }
  }
}
