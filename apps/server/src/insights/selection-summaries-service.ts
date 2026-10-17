import { runVolume, selectionSummaryOutputSchema, type EditRun } from '@superdoc-collab/history';
import {
  GROUPING_FAILED_MESSAGE,
  secondsRoundedUp,
  SUMMARIZE_COOLDOWN_MS,
  SELECTION_SUMMARY_FAILED_MESSAGE,
  SelectionSummaryState,
  SummarizeStep,
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
import {
  authorsMentioned,
  fitSelection,
  mentionedAuthors,
  namesOf,
  promptEditsOf,
  SELECTION_SYSTEM_PROMPT,
  selectionPrompt,
} from './prompts';
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

export type RequestedSelection = EditSelection & { binMs: number | null; timeZone: string };
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
  readonly cooldown = new KeyedCooldown({ durationMs: SUMMARIZE_COOLDOWN_MS });
  private readonly repository: InsightsRepository;
  private readonly languageModel: LanguageModelChoice;
  private readonly jobRunner: InsightsJobRunner;
  private readonly readSelection: ReadSelection;
  private readonly steps = new Map<string, SummarizeStep>();
  private readonly failures = new Map<string, string>();

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
    if (resolved === null) return this.view({ documentId, state: SelectionSummaryState.None, summary: null, failure: null });
    const stored = this.repository.selectionSummary({ documentId, key: resolved.key });
    const summary = summaryOf({ stored, stamp: resolved });
    const isRunning = this.step(documentId) !== SummarizeStep.Idle || this.jobRunner.isRunning(jobKeyOf({ documentId, key: resolved.key }));
    if (isRunning) return this.view({ documentId, state: SelectionSummaryState.Running, summary, failure: null });
    if (this.languageModel.availability === LanguageModelAvailability.Unavailable)
      return this.view({ documentId, state: SelectionSummaryState.Failed, summary, failure: this.languageModel.reason });
    const groupingFailure = this.failures.get(documentId);
    if (groupingFailure !== undefined)
      return this.view({ documentId, state: SelectionSummaryState.Failed, summary, failure: groupingFailure });
    if (stored === null) return this.view({ documentId, state: SelectionSummaryState.None, summary: null, failure: null });
    if (stored.failure !== null) return this.view({ documentId, state: SelectionSummaryState.Failed, summary, failure: stored.failure });
    return this.view({ documentId, state: SelectionSummaryState.Ready, summary, failure: null });
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

  isStale({ documentId, selection }: { documentId: string; selection: RequestedSelection }): boolean {
    const resolved = this.readNonEmptySelection({ documentId, selection });
    if (resolved === null) return false;
    return !isFresh({ stored: this.repository.selectionSummary({ documentId, key: resolved.key }), stamp: resolved });
  }

  async write({ documentId, selection }: { documentId: string; selection: RequestedSelection }): Promise<void> {
    const languageModel = this.languageModel;
    if (languageModel.availability === LanguageModelAvailability.Unavailable) return;
    const resolved = this.readNonEmptySelection({ documentId, selection });
    if (resolved === null) return;
    if (isFresh({ stored: this.repository.selectionSummary({ documentId, key: resolved.key }), stamp: resolved })) return;
    if (!this.jobRunner.consumeCall()) return;
    await this.generate({ documentId, resolved, model: languageModel.model });
  }

  setStep({ documentId, step }: { documentId: string; step: SummarizeStep }): void {
    this.steps.set(documentId, step);
  }

  setGroupingFailure({ documentId, hasFailed }: { documentId: string; hasFailed: boolean }): void {
    if (hasFailed) this.failures.set(documentId, GROUPING_FAILED_MESSAGE);
    else this.failures.delete(documentId);
  }

  forget(documentId: string): void {
    this.cooldown.forget(documentId);
    this.steps.delete(documentId);
    this.failures.delete(documentId);
  }

  private step(documentId: string): SummarizeStep {
    const step = this.steps.get(documentId);
    if (step === undefined) return SummarizeStep.Idle;
    return step;
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
      key: selectionKeyOf({ selection, binMs: snapshot.binMs, timeZone: selection.timeZone }),
      snapshot: { ...snapshot, runs },
      cursor,
      topicsUpdatedAt: snapshot.topicsUpdatedAt,
    };
  }

  private view({
    documentId,
    state,
    summary,
    failure,
  }: {
    documentId: string;
    state: SelectionSummaryState;
    summary: SelectionSummary | null;
    failure: string | null;
  }): SelectionSummaryView {
    return {
      state,
      summary,
      failure,
      isModelAvailable: this.languageModel.availability === LanguageModelAvailability.Ready,
      step: this.step(documentId),
    };
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
    if (!this.jobRunner.consumeCall()) return;
    this.cooldown.start(documentId);
    await this.generate({ documentId, resolved, model });
  }

  private async generate({
    documentId,
    resolved,
    model,
  }: {
    documentId: string;
    resolved: ResolvedSelection;
    model: LanguageModel;
  }): Promise<void> {
    const { key, cursor, topicsUpdatedAt } = resolved;
    try {
      const edits = fitSelection(promptEditsOf({ runs: resolved.snapshot.runs, authors: resolved.snapshot.authors }));
      const names = namesOf(edits);
      const output = await generateStructured({
        model,
        schema: selectionSummaryOutputSchema,
        system: SELECTION_SYSTEM_PROMPT,
        prompt: selectionPrompt(edits),
      });
      const authors = authorsMentioned({ edits, mentioned: mentionedAuthors({ returned: output.authors, names }) });
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
