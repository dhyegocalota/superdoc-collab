import { secondsRoundedUp, SummarizeStep } from '@superdoc-collab/types';
import { JobOutcome, type InsightsJobRunner } from './insights-job-runner';
import { LanguageModelAvailability, type LanguageModelChoice } from './llm-client';
import type { RequestedSelection, SelectionSummariesService } from './selection-summaries-service';
import type { SummariesService } from './summaries-service';
import type { TopicsService } from './topics-service';

export enum SummarizeOutcome {
  Started = 'started',
  AlreadyRunning = 'already-running',
  UpToDate = 'up-to-date',
  Busy = 'busy',
  Unavailable = 'unavailable',
}

export type SummarizeResult =
  | { outcome: SummarizeOutcome.Started | SummarizeOutcome.AlreadyRunning | SummarizeOutcome.UpToDate }
  | { outcome: SummarizeOutcome.Busy; retryAfterSeconds: number }
  | { outcome: SummarizeOutcome.Unavailable; reason: string };

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
  request({ documentId, selection }: SummarizeRequest): SummarizeResult {
    if (this.languageModel.availability === LanguageModelAvailability.Unavailable)
      return { outcome: SummarizeOutcome.Unavailable, reason: this.languageModel.reason };
    const key = summarizeKey(documentId);
    if (this.jobRunner.isRunning(key)) return { outcome: SummarizeOutcome.AlreadyRunning };
    const needsRegroup = this.topics.isStale(documentId);
    const isAnythingStale = needsRegroup || this.selection.isStale({ documentId, selection }) || this.summaries.isStale(documentId);
    if (!isAnythingStale) return { outcome: SummarizeOutcome.UpToDate };
    const cooldownRemainingMs = this.selection.cooldown.remainingMs(documentId);
    const isWaiting = cooldownRemainingMs > 0 || !this.jobRunner.hasCallBudget();
    if (isWaiting) return this.busy(cooldownRemainingMs);
    const outcome = this.jobRunner.run({ key, job: () => this.run({ documentId, selection, needsRegroup }) });
    if (outcome === JobOutcome.Busy) return this.busy(cooldownRemainingMs);
    return { outcome: SummarizeOutcome.Started };
  }

  private busy(cooldownRemainingMs: number): SummarizeResult {
    const waitMs = Math.max(cooldownRemainingMs, this.jobRunner.retryAfterMs());
    return { outcome: SummarizeOutcome.Busy, retryAfterSeconds: secondsRoundedUp(waitMs) };
  }

  private async regroup(documentId: string): Promise<void> {
    this.selection.setStep({ documentId, step: SummarizeStep.Grouping });
    await this.topics.regroup(documentId);
  }

  private async run({ documentId, selection, needsRegroup }: SummarizeRequest & { needsRegroup: boolean }): Promise<void> {
    this.selection.cooldown.start(documentId);
    try {
      if (needsRegroup) await this.regroup(documentId);
      this.selection.setStep({ documentId, step: SummarizeStep.Summarizing });
      await this.selection.write({ documentId, selection });
      await this.summaries.rewriteStale(documentId);
    } finally {
      this.selection.setStep({ documentId, step: SummarizeStep.Idle });
    }
  }
}
