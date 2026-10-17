import type { EditRun } from '@superdoc-history/history';
import { SelectionSummaryState, type EditSelection, type EventAuthor, type SelectionSummaryView } from '@superdoc-history/types';
import { DocumentCooldown } from './document-cooldown';
import type { InsightsRepository } from './insights-repository';
import type { InsightsWorker } from './insights-worker';
import type { LanguageModelChoice } from './llm-client';

export const SELECTION_SUMMARY_FAILED_LOG = 'Summarizing a selection failed for document';

export enum SelectionRequestOutcome {
  Started = 'started',
  AlreadyRunning = 'already-running',
  Cached = 'cached',
  Empty = 'empty',
  TooSoon = 'too-soon',
  Busy = 'busy',
  Unavailable = 'unavailable',
}

export type SelectionRequestResult =
  | { outcome: SelectionRequestOutcome.Started | SelectionRequestOutcome.AlreadyRunning | SelectionRequestOutcome.Cached | SelectionRequestOutcome.Empty | SelectionRequestOutcome.Busy }
  | { outcome: SelectionRequestOutcome.TooSoon; retryAfterSeconds: number }
  | { outcome: SelectionRequestOutcome.Unavailable; reason: string };

export type RequestedSelection = EditSelection & { binMs: number | null };
export type SelectionSnapshot = { runs: EditRun[]; authors: Record<string, EventAuthor>; binMs: number; cursor: number | null; topicsUpdatedAt: number | null };
export type ReadSelection = (options: { documentId: string; selection: RequestedSelection }) => SelectionSnapshot;

export class SelectionSummariesService {
  readonly cooldown = new DocumentCooldown({ durationMs: 0 });

  constructor(_options: { repository: InsightsRepository; languageModel: LanguageModelChoice; worker: InsightsWorker; readSelection: ReadSelection }) {}

  read(_options: { documentId: string; selection: RequestedSelection }): SelectionSummaryView {
    return { state: SelectionSummaryState.None, summary: null, failure: null, isModelAvailable: true };
  }

  request(_options: { documentId: string; selection: RequestedSelection }): SelectionRequestResult {
    return { outcome: SelectionRequestOutcome.Empty };
  }

  forget(_documentId: string): void {}
}
