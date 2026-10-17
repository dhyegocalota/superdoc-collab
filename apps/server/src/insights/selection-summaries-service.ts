import { selectionSummaryOutputSchema, type EditRun } from '@superdoc-history/history';
import { SECOND_MS, SELECTION_SUMMARY_COOLDOWN_MS, SELECTION_SUMMARY_FAILED_MESSAGE, SelectionSummaryState, type EditSelection, type EventAuthor, type SelectionSummary, type SelectionSummaryView } from '@superdoc-history/types';
import type { LanguageModel } from 'ai';
import { describeError } from '../history/projection-messages';
import { DocumentCooldown } from './document-cooldown';
import type { InsightsRepository, StoredSelectionSummary } from './insights-repository';
import { JobOutcome, type InsightsWorker } from './insights-worker';
import { generateStructured, LanguageModelAvailability, type LanguageModelChoice } from './llm-client';
import { fitSelection, namesOf, SELECTION_SYSTEM_PROMPT, selectionPrompt, type SelectionEdit } from './prompts';
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
  | { outcome: SelectionRequestOutcome.Started | SelectionRequestOutcome.AlreadyRunning | SelectionRequestOutcome.Cached | SelectionRequestOutcome.Empty | SelectionRequestOutcome.Busy }
  | { outcome: SelectionRequestOutcome.TooSoon; retryAfterSeconds: number }
  | { outcome: SelectionRequestOutcome.Unavailable; reason: string };

export type RequestedSelection = EditSelection & { binMs: number | null };
export type SelectionSnapshot = { runs: EditRun[]; authors: Record<string, EventAuthor>; binMs: number; cursor: number | null; topicsUpdatedAt: number | null };
export type ReadSelection = (options: { documentId: string; selection: RequestedSelection }) => SelectionSnapshot;

type SelectionStamp = { cursor: number; topicsUpdatedAt: number | null };
type ResolvedSelection = SelectionStamp & { key: string; snapshot: SelectionSnapshot };

function jobKeyOf({ documentId, key }: { documentId: string; key: string }): string {
  return `selection:${documentId}:${key}`;
}

function matchesStamp({ stored, stamp }: { stored: StoredSelectionSummary; stamp: SelectionStamp }): boolean {
  return stored.computedAtSequence === stamp.cursor && stored.topicsUpdatedAt === stamp.topicsUpdatedAt;
}

function isFresh({ stored, stamp }: { stored: StoredSelectionSummary | null; stamp: SelectionStamp }): boolean {
  if (stored === null || stored.sentence === null || stored.failure !== null) return false;
  return matchesStamp({ stored, stamp });
}

function summaryOf({ stored, stamp }: { stored: StoredSelectionSummary | null; stamp: SelectionStamp }): SelectionSummary | null {
  if (stored === null || stored.sentence === null) return null;
  return { key: stored.key, sentence: stored.sentence, authors: stored.authors, computedAtSequence: stored.computedAtSequence, isStale: !matchesStamp({ stored, stamp }) };
}

function editsOf(snapshot: SelectionSnapshot): SelectionEdit[] {
  return [...snapshot.runs]
    .sort((left, right) => right.lastServerTime - left.lastServerTime)
    .map((run) => ({ authors: run.authorKeys.map((key) => snapshot.authors[key]!.name), inserted: run.inserted, deleted: run.deleted }));
}

export class SelectionSummariesService {
  readonly cooldown = new DocumentCooldown({ durationMs: SELECTION_SUMMARY_COOLDOWN_MS });
  private readonly repository: InsightsRepository;
  private readonly languageModel: LanguageModelChoice;
  private readonly worker: InsightsWorker;
  private readonly readSelection: ReadSelection;

  constructor({ repository, languageModel, worker, readSelection }: { repository: InsightsRepository; languageModel: LanguageModelChoice; worker: InsightsWorker; readSelection: ReadSelection }) {
    this.repository = repository;
    this.languageModel = languageModel;
    this.worker = worker;
    this.readSelection = readSelection;
  }

  read({ documentId, selection }: { documentId: string; selection: RequestedSelection }): SelectionSummaryView {
    const resolved = this.resolve({ documentId, selection });
    if (resolved === null) return this.view({ state: SelectionSummaryState.None, summary: null, failure: null });
    const stored = this.repository.selectionSummary({ documentId, key: resolved.key });
    const summary = summaryOf({ stored, stamp: resolved });
    if (this.worker.isRunning(jobKeyOf({ documentId, key: resolved.key }))) return this.view({ state: SelectionSummaryState.Running, summary, failure: null });
    if (this.languageModel.availability === LanguageModelAvailability.Unavailable) return this.view({ state: SelectionSummaryState.Failed, summary, failure: this.languageModel.reason });
    if (stored === null) return this.view({ state: SelectionSummaryState.None, summary: null, failure: null });
    if (stored.failure !== null) return this.view({ state: SelectionSummaryState.Failed, summary, failure: stored.failure });
    return this.view({ state: SelectionSummaryState.Ready, summary, failure: null });
  }

  request({ documentId, selection }: { documentId: string; selection: RequestedSelection }): SelectionRequestResult {
    const choice = this.languageModel;
    if (choice.availability === LanguageModelAvailability.Unavailable) return { outcome: SelectionRequestOutcome.Unavailable, reason: choice.reason };
    const resolved = this.resolve({ documentId, selection });
    if (resolved === null) return { outcome: SelectionRequestOutcome.Empty };
    if (isFresh({ stored: this.repository.selectionSummary({ documentId, key: resolved.key }), stamp: resolved })) return { outcome: SelectionRequestOutcome.Cached };
    const jobKey = jobKeyOf({ documentId, key: resolved.key });
    if (this.worker.isRunning(jobKey)) return { outcome: SelectionRequestOutcome.AlreadyRunning };
    const remainingMs = this.cooldown.remainingMs(documentId);
    if (remainingMs > 0) return { outcome: SelectionRequestOutcome.TooSoon, retryAfterSeconds: Math.ceil(remainingMs / SECOND_MS) };
    if (!this.worker.hasCallBudget()) return { outcome: SelectionRequestOutcome.Busy };
    const outcome = this.worker.run({ key: jobKey, job: () => this.summarize({ documentId, resolved, model: choice.model }) });
    if (outcome === JobOutcome.Busy) return { outcome: SelectionRequestOutcome.Busy };
    return { outcome: SelectionRequestOutcome.Started };
  }

  forget(documentId: string): void {
    this.cooldown.forget(documentId);
  }

  private resolve({ documentId, selection }: { documentId: string; selection: RequestedSelection }): ResolvedSelection | null {
    const snapshot = this.readSelection({ documentId, selection });
    const { cursor } = snapshot;
    const runs = snapshot.runs.filter((run) => run.inserted.length + run.deleted.length > 0);
    if (runs.length === 0 || cursor === null) return null;
    return { key: selectionKeyOf({ selection, binMs: snapshot.binMs }), snapshot: { ...snapshot, runs }, cursor, topicsUpdatedAt: snapshot.topicsUpdatedAt };
  }

  private view({ state, summary, failure }: { state: SelectionSummaryState; summary: SelectionSummary | null; failure: string | null }): SelectionSummaryView {
    return { state, summary, failure, isModelAvailable: this.languageModel.availability === LanguageModelAvailability.Ready };
  }

  private async summarize({ documentId, resolved, model }: { documentId: string; resolved: ResolvedSelection; model: LanguageModel }): Promise<void> {
    const { key, cursor, topicsUpdatedAt } = resolved;
    if (!this.worker.consumeCall()) return;
    this.cooldown.start(documentId);
    try {
      const edits = fitSelection(editsOf(resolved.snapshot));
      const names = namesOf(edits);
      const output = await generateStructured({ model, schema: selectionSummaryOutputSchema, system: SELECTION_SYSTEM_PROMPT, prompt: selectionPrompt(edits) });
      const authors = [...new Set(output.authors.filter((name) => names.includes(name)))];
      this.repository.saveSelectionSummary({ documentId, key, sentence: output.sentence, authors, computedAtSequence: cursor, topicsUpdatedAt });
    } catch (error) {
      console.error(`${SELECTION_SUMMARY_FAILED_LOG} ${documentId}: ${describeError(error)}`);
      this.repository.saveSelectionFailure({ documentId, key, failure: SELECTION_SUMMARY_FAILED_MESSAGE, computedAtSequence: cursor, topicsUpdatedAt });
    }
  }
}
