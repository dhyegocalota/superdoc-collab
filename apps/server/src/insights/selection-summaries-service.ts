import { runVolume, selectionSummaryOutputSchema, type EditRun } from '@superdoc-collab/history';
import {
  secondsRoundedUp,
  SELECTION_SUMMARY_COOLDOWN_MS,
  SELECTION_SUMMARY_FAILED_MESSAGE,
  SelectionSummaryState,
  UTC_TIME_ZONE,
  type EditSelection,
  type EventAuthor,
  type SelectionSummary,
  type SelectionSummaryView,
} from '@superdoc-collab/types';
import type { LanguageModel } from 'ai';
import { KeyedCooldown } from '../limits/keyed-cooldown';
import { describeError } from '../logging/describe-error';
import type { InsightsRepository, StoredSelectionSummary } from './insights-repository';
import { JobOutcome, type InsightsJobRunner } from './insights-job-runner';
import { generateStructured, LanguageModelAvailability, type LanguageModelChoice } from './llm-client';
import { fitSelection, mentionedAuthors, namesOf, promptEditsOf, SELECTION_SYSTEM_PROMPT, selectionPrompt } from './prompts';
import { selectionKeyOf } from './selection-key';

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
  | {
      outcome:
        | SelectionRequestOutcome.Started
        | SelectionRequestOutcome.AlreadyRunning
        | SelectionRequestOutcome.Cached
        | SelectionRequestOutcome.Empty;
    }
  | { outcome: SelectionRequestOutcome.TooSoon | SelectionRequestOutcome.Busy; retryAfterSeconds: number }
  | { outcome: SelectionRequestOutcome.Unavailable; reason: string };

export type RequestedSelection = EditSelection & { binMs: number | null };
export type SelectionSnapshot = {
  runs: EditRun[];
  authors: Record<string, EventAuthor>;
  binMs: number;
  cursor: number | null;
  topicsUpdatedAt: number | null;
};
export type ReadSelection = (options: { documentId: string; selection: RequestedSelection }) => SelectionSnapshot;

type SelectionStamp = { cursor: number; topicsUpdatedAt: number | null };
type ResolvedSelection = SelectionStamp & { key: string; snapshot: SelectionSnapshot };

function jobKeyOf({ documentId, key }: { documentId: string; key: string }): string {
  return `selection:${documentId}:${key}`;
}

function matchesStamp({ stored, stamp }: { stored: StoredSelectionSummary; stamp: SelectionStamp }): boolean {
  return stored.computedAtSequence === stamp.cursor && stored.topicsUpdatedAt === stamp.topicsUpdatedAt;
}

function hasUsableSentence(stored: StoredSelectionSummary | null): stored is StoredSelectionSummary & { sentence: string } {
  return stored !== null && stored.sentence !== null && stored.failure === null;
}

function isFresh({ stored, stamp }: { stored: StoredSelectionSummary | null; stamp: SelectionStamp }): boolean {
  if (!hasUsableSentence(stored)) return false;
  return matchesStamp({ stored, stamp });
}

function summaryOf({ stored, stamp }: { stored: StoredSelectionSummary | null; stamp: SelectionStamp }): SelectionSummary | null {
  if (stored === null || stored.sentence === null) return null;
  return {
    key: stored.key,
    sentence: stored.sentence,
    authors: stored.authors,
    computedAtSequence: stored.computedAtSequence,
    isStale: !matchesStamp({ stored, stamp }),
  };
}

export class SelectionSummariesService {
  readonly cooldown = new KeyedCooldown({ durationMs: SELECTION_SUMMARY_COOLDOWN_MS });
  private readonly repository: InsightsRepository;
  private readonly languageModel: LanguageModelChoice;
  private readonly jobRunner: InsightsJobRunner;
  private readonly readSelection: ReadSelection;

  constructor({
    repository,
    languageModel,
    jobRunner,
    readSelection,
  }: {
    repository: InsightsRepository;
    languageModel: LanguageModelChoice;
    jobRunner: InsightsJobRunner;
    readSelection: ReadSelection;
  }) {
    this.repository = repository;
    this.languageModel = languageModel;
    this.jobRunner = jobRunner;
    this.readSelection = readSelection;
  }

  read({ documentId, selection }: { documentId: string; selection: RequestedSelection }): SelectionSummaryView {
    const resolved = this.readNonEmptySelection({ documentId, selection });
    if (resolved === null) return this.view({ state: SelectionSummaryState.None, summary: null, failure: null });
    const stored = this.repository.selectionSummary({ documentId, key: resolved.key });
    const summary = summaryOf({ stored, stamp: resolved });
    if (this.jobRunner.isRunning(jobKeyOf({ documentId, key: resolved.key })))
      return this.view({ state: SelectionSummaryState.Running, summary, failure: null });
    if (this.languageModel.availability === LanguageModelAvailability.Unavailable)
      return this.view({ state: SelectionSummaryState.Failed, summary, failure: this.languageModel.reason });
    if (stored === null) return this.view({ state: SelectionSummaryState.None, summary: null, failure: null });
    if (stored.failure !== null) return this.view({ state: SelectionSummaryState.Failed, summary, failure: stored.failure });
    return this.view({ state: SelectionSummaryState.Ready, summary, failure: null });
  }

  request({ documentId, selection }: { documentId: string; selection: RequestedSelection }): SelectionRequestResult {
    const languageModel = this.languageModel;
    if (languageModel.availability === LanguageModelAvailability.Unavailable)
      return { outcome: SelectionRequestOutcome.Unavailable, reason: languageModel.reason };
    const resolved = this.readNonEmptySelection({ documentId, selection });
    if (resolved === null) return { outcome: SelectionRequestOutcome.Empty };
    if (isFresh({ stored: this.repository.selectionSummary({ documentId, key: resolved.key }), stamp: resolved }))
      return { outcome: SelectionRequestOutcome.Cached };
    const jobKey = jobKeyOf({ documentId, key: resolved.key });
    if (this.jobRunner.isRunning(jobKey)) return { outcome: SelectionRequestOutcome.AlreadyRunning };
    const remainingMs = this.cooldown.remainingMs(documentId);
    if (remainingMs > 0) return { outcome: SelectionRequestOutcome.TooSoon, retryAfterSeconds: secondsRoundedUp(remainingMs) };
    if (!this.jobRunner.hasCallBudget()) return this.busy();
    const outcome = this.jobRunner.run({ key: jobKey, job: () => this.summarize({ documentId, resolved, model: languageModel.model }) });
    if (outcome === JobOutcome.Busy) return this.busy();
    return { outcome: SelectionRequestOutcome.Started };
  }

  forget(documentId: string): void {
    this.cooldown.forget(documentId);
  }

  private busy(): SelectionRequestResult {
    return { outcome: SelectionRequestOutcome.Busy, retryAfterSeconds: secondsRoundedUp(this.jobRunner.retryAfterMs()) };
  }

  private readNonEmptySelection({
    documentId,
    selection,
  }: {
    documentId: string;
    selection: RequestedSelection;
  }): ResolvedSelection | null {
    const snapshot = this.readSelection({ documentId, selection });
    const { cursor } = snapshot;
    const runs = snapshot.runs.filter((run) => runVolume(run) > 0);
    if (runs.length === 0 || cursor === null) return null;
    return {
      key: selectionKeyOf({ selection, binMs: snapshot.binMs, timeZone: UTC_TIME_ZONE }),
      snapshot: { ...snapshot, runs },
      cursor,
      topicsUpdatedAt: snapshot.topicsUpdatedAt,
    };
  }

  private view({
    state,
    summary,
    failure,
  }: {
    state: SelectionSummaryState;
    summary: SelectionSummary | null;
    failure: string | null;
  }): SelectionSummaryView {
    return { state, summary, failure, isModelAvailable: this.languageModel.availability === LanguageModelAvailability.Ready };
  }

  private async summarize({
    documentId,
    resolved,
    model,
  }: {
    documentId: string;
    resolved: ResolvedSelection;
    model: LanguageModel;
  }): Promise<void> {
    const { key, cursor, topicsUpdatedAt } = resolved;
    if (!this.jobRunner.consumeCall()) return;
    this.cooldown.start(documentId);
    try {
      const edits = fitSelection(promptEditsOf({ runs: resolved.snapshot.runs, authors: resolved.snapshot.authors }));
      const names = namesOf(edits);
      const output = await generateStructured({
        model,
        schema: selectionSummaryOutputSchema,
        system: SELECTION_SYSTEM_PROMPT,
        prompt: selectionPrompt(edits),
      });
      const authors = mentionedAuthors({ returned: output.authors, names });
      this.repository.saveSelectionSummary({
        documentId,
        key,
        sentence: output.sentence,
        authors,
        computedAtSequence: cursor,
        topicsUpdatedAt,
      });
    } catch (error) {
      console.error(`${SELECTION_SUMMARY_FAILED_LOG} ${documentId}: ${describeError(error)}`);
      this.storeFailure({ documentId, resolved });
    }
  }

  private storeFailure({ documentId, resolved }: { documentId: string; resolved: ResolvedSelection }): void {
    try {
      this.repository.saveSelectionFailure({
        documentId,
        key: resolved.key,
        failure: SELECTION_SUMMARY_FAILED_MESSAGE,
        computedAtSequence: resolved.cursor,
        topicsUpdatedAt: resolved.topicsUpdatedAt,
      });
    } catch (error) {
      console.error(`${SELECTION_SUMMARY_FAILED_LOG} ${documentId}: ${describeError(error)}`);
    }
  }
}
