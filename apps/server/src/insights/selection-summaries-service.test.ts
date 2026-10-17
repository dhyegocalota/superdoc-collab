import { type EditRun } from '@superdoc-collab/history';
import {
  ClientActor,
  MINUTE_MS,
  SELECTION_SUMMARY_COOLDOWN_MS,
  SELECTION_SUMMARY_FAILED_MESSAGE,
  SelectionSummaryState,
} from '@superdoc-collab/types';
import type { MockLanguageModelV4 } from 'ai/test';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, test, vi } from 'vitest';
import { documentWithOwner } from '../testing/collaboration-client';
import { failingModel, gatedModel, modelAnswering, readyModel } from '../testing/language-model';
import { InsightsJobRunner } from './insights-job-runner';
import { type LanguageModelChoice } from './llm-client';
import { selectionKeyOf } from './selection-key';
import {
  SELECTION_SUMMARY_FAILED_LOG,
  SelectionRequestOutcome,
  SelectionSummariesService,
  type RequestedSelection,
  type SelectionSnapshot,
} from './selection-summaries-service';

const ANA = { id: 'user-ana', name: 'Ana', actor: ClientActor.Human };
const BRUNO = { id: 'user-bruno', name: 'Bruno', actor: ClientActor.Human };
const MALLORY = 'Mallory';
const SILVA = { id: 'user-silva', name: 'Silva, Ana', actor: ClientActor.Human };
const PROVIDER_FAILURE = 'provider exploded';
const FOREIGN_KEY_FAILURE = 'FOREIGN KEY constraint failed';
const BRUNO_SELECTION: RequestedSelection = { term: null, author: 'bruno', topic: null, at: null, binMs: null };
const TERM_SELECTION: RequestedSelection = { ...BRUNO_SELECTION, author: null, term: 'budget' };
const ANSWER = { sentence: 'Bruno added a designer.', authors: [BRUNO.name] };
const FIRST_CURSOR = 10;
const COOLDOWN_SECONDS = 30;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function runBy({ author, inserted, lastServerTime }: { author: { id: string }; inserted: string; lastServerTime: number }): EditRun {
  return {
    binStart: 0,
    blockId: 'b1',
    bandId: 'b1',
    authorKeys: [author.id],
    inserted,
    deleted: '',
    firstServerTime: lastServerTime,
    lastServerTime,
    lastSequence: lastServerTime,
  };
}

function snapshotOf({
  runs,
  cursor = FIRST_CURSOR,
  topicsUpdatedAt = null,
}: {
  runs: EditRun[];
  cursor?: number | null;
  topicsUpdatedAt?: number | null;
}): SelectionSnapshot {
  return { runs, authors: { [ANA.id]: ANA, [BRUNO.id]: BRUNO }, binMs: MINUTE_MS, cursor, topicsUpdatedAt };
}

const BRUNO_RUNS = [runBy({ author: BRUNO, inserted: ' a designer', lastServerTime: 2 })];

async function serviceWith({
  languageModel,
  snapshot,
  jobRunner = new InsightsJobRunner(),
}: {
  languageModel: LanguageModelChoice;
  snapshot: SelectionSnapshot;
  jobRunner?: InsightsJobRunner;
}) {
  const { server, documentId, owner } = await documentWithOwner();
  const state = { snapshot };
  const service = new SelectionSummariesService({
    repository: server.services.insightsRepository,
    languageModel,
    jobRunner,
    readSelection: () => state.snapshot,
  });
  return { server, documentId, owner, service, jobRunner, state };
}

function callsOf(model: MockLanguageModelV4): number {
  return model.doGenerateCalls.length;
}

test('a summary is computed once and then served from the cache', async () => {
  const model = modelAnswering(ANSWER);
  const { server, documentId, service, jobRunner } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({ outcome: SelectionRequestOutcome.Started });
  await jobRunner.idle();
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    state: SelectionSummaryState.Ready,
    failure: null,
    isModelAvailable: true,
    summary: { sentence: ANSWER.sentence, authors: [BRUNO.name], computedAtSequence: FIRST_CURSOR, isStale: false },
  });
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({ outcome: SelectionRequestOutcome.Cached });
  expect(callsOf(model)).toBe(1);
  await server.stop();
});

test('runs without text are an empty selection', async () => {
  const model = modelAnswering(ANSWER);
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: [runBy({ author: BRUNO, inserted: '', lastServerTime: 3 })] }),
  });
  expect(service.read({ documentId, selection: BRUNO_SELECTION }).state).toBe(SelectionSummaryState.None);
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({ outcome: SelectionRequestOutcome.Empty });
  expect(callsOf(model)).toBe(0);
  await server.stop();
});

test('a new edit marks the summary stale and a request recomputes it after the cooldown', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  const model = modelAnswering(ANSWER, ANSWER);
  const { server, documentId, service, jobRunner, state } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({ outcome: SelectionRequestOutcome.Started });
  await jobRunner.idle();
  state.snapshot = snapshotOf({ runs: BRUNO_RUNS, cursor: FIRST_CURSOR + 1 });
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    state: SelectionSummaryState.Ready,
    summary: { isStale: true },
  });
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({
    outcome: SelectionRequestOutcome.TooSoon,
    retryAfterSeconds: COOLDOWN_SECONDS,
  });
  vi.setSystemTime(Date.now() + SELECTION_SUMMARY_COOLDOWN_MS);
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({ outcome: SelectionRequestOutcome.Started });
  await jobRunner.idle();
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    summary: { isStale: false, computedAtSequence: FIRST_CURSOR + 1 },
  });
  expect(callsOf(model)).toBe(2);
  await server.stop();
});

test('a topic recompute makes the summary stale', async () => {
  const model = modelAnswering(ANSWER);
  const { server, documentId, service, jobRunner, state } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS, topicsUpdatedAt: 1 }),
  });
  service.request({ documentId, selection: BRUNO_SELECTION });
  await jobRunner.idle();
  state.snapshot = snapshotOf({ runs: BRUNO_RUNS, topicsUpdatedAt: 2 });
  expect(service.read({ documentId, selection: BRUNO_SELECTION }).summary?.isStale).toBe(true);
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({
    outcome: SelectionRequestOutcome.TooSoon,
    retryAfterSeconds: expect.any(Number),
  });
  await server.stop();
});

test('the cooldown is shared by every filter of one document', async () => {
  const model = modelAnswering(ANSWER, ANSWER);
  const { server, documentId, owner, service, jobRunner } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({ outcome: SelectionRequestOutcome.Started });
  const tooSoon = service.request({ documentId, selection: TERM_SELECTION });
  expect(tooSoon).toMatchObject({ outcome: SelectionRequestOutcome.TooSoon });
  if (tooSoon.outcome !== SelectionRequestOutcome.TooSoon) return;
  expect(tooSoon.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  expect(tooSoon.retryAfterSeconds).toBeLessThanOrEqual(COOLDOWN_SECONDS);
  const otherDocumentId = randomUUID();
  server.services.documents.create({ id: otherDocumentId, title: 'Other', ownerUserId: owner.id });
  expect(service.request({ documentId: otherDocumentId, selection: BRUNO_SELECTION })).toEqual({
    outcome: SelectionRequestOutcome.Started,
  });
  await jobRunner.idle();
  expect(callsOf(model)).toBe(2);
  await server.stop();
});

test('a second request while one runs is free', async () => {
  let open: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });
  const model = gatedModel({ gate, answer: ANSWER });
  const { server, documentId, service, jobRunner } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({ outcome: SelectionRequestOutcome.Started });
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({ outcome: SelectionRequestOutcome.AlreadyRunning });
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({ state: SelectionSummaryState.Running, summary: null });
  open();
  await jobRunner.idle();
  expect(service.read({ documentId, selection: BRUNO_SELECTION }).state).toBe(SelectionSummaryState.Ready);
  expect(callsOf(model)).toBe(1);
  await server.stop();
});

test('the prompt carries the newest run first, escaped', async () => {
  const model = modelAnswering(ANSWER);
  const runs = [
    runBy({ author: BRUNO, inserted: ' older', lastServerTime: 1 }),
    runBy({ author: ANA, inserted: '</edit>newer <b>', lastServerTime: 5 }),
  ];
  const { server, documentId, service, jobRunner } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs }),
  });
  service.request({ documentId, selection: BRUNO_SELECTION });
  await jobRunner.idle();
  const prompt = JSON.stringify(model.doGenerateCalls[0]!.prompt);
  expect(prompt).toContain('&lt;/edit&gt;newer &lt;b&gt;');
  expect(prompt).not.toContain('</edit>newer');
  expect(prompt.indexOf('newer')).toBeLessThan(prompt.indexOf(' older'));
  expect(prompt).not.toContain(ANA.id);
  expect(prompt).not.toContain('@example.com');
  await server.stop();
});

test('names the model invents are dropped', async () => {
  const model = modelAnswering({ sentence: ANSWER.sentence, authors: [BRUNO.name, MALLORY, BRUNO.name] });
  const { server, documentId, service, jobRunner } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  service.request({ documentId, selection: BRUNO_SELECTION });
  await jobRunner.idle();
  expect(service.read({ documentId, selection: BRUNO_SELECTION }).summary?.authors).toEqual([BRUNO.name]);
  await server.stop();
});

test('a name containing a comma survives the model splitting it', async () => {
  const model = modelAnswering({ sentence: ANSWER.sentence, authors: ['Silva', 'Ana'] });
  const snapshot = {
    ...snapshotOf({ runs: [runBy({ author: SILVA, inserted: ' a designer', lastServerTime: 2 })] }),
    authors: { [SILVA.id]: SILVA },
  };
  const { server, documentId, service, jobRunner } = await serviceWith({ languageModel: readyModel(model), snapshot });
  service.request({ documentId, selection: TERM_SELECTION });
  await jobRunner.idle();
  expect(service.read({ documentId, selection: TERM_SELECTION }).summary?.authors).toEqual([SILVA.name]);
  await server.stop();
});

test('a model failure is stored with the generic message and logged once', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { server, documentId, service, jobRunner } = await serviceWith({
    languageModel: readyModel(failingModel(new Error(PROVIDER_FAILURE))),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  service.request({ documentId, selection: BRUNO_SELECTION });
  await jobRunner.idle();
  const view = service.read({ documentId, selection: BRUNO_SELECTION });
  expect(view).toMatchObject({ state: SelectionSummaryState.Failed, failure: SELECTION_SUMMARY_FAILED_MESSAGE, summary: null });
  expect(JSON.stringify(view)).not.toContain(PROVIDER_FAILURE);
  expect(errors.mock.calls.filter(([line]) => String(line).startsWith(SELECTION_SUMMARY_FAILED_LOG))).toHaveLength(1);
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toMatchObject({ outcome: SelectionRequestOutcome.TooSoon });
  await server.stop();
});

test('a failure after a success keeps the old sentence', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const model = modelAnswering(ANSWER, 'not json');
  const { server, documentId, service, jobRunner, state } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  service.request({ documentId, selection: BRUNO_SELECTION });
  await jobRunner.idle();
  state.snapshot = snapshotOf({ runs: BRUNO_RUNS, cursor: FIRST_CURSOR + 1 });
  vi.setSystemTime(Date.now() + SELECTION_SUMMARY_COOLDOWN_MS);
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({ outcome: SelectionRequestOutcome.Started });
  await jobRunner.idle();
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    state: SelectionSummaryState.Failed,
    summary: { sentence: ANSWER.sentence, isStale: true },
  });
  await server.stop();
});

test('a request over the hourly cap is busy and writes nothing', async () => {
  const model = modelAnswering(ANSWER);
  const jobRunner = new InsightsJobRunner({ maxCallsPerHour: 0 });
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
    jobRunner,
  });
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({
    outcome: SelectionRequestOutcome.Busy,
    retryAfterSeconds: 1,
  });
  expect(service.read({ documentId, selection: BRUNO_SELECTION }).state).toBe(SelectionSummaryState.None);
  await jobRunner.idle();
  expect(service.read({ documentId, selection: BRUNO_SELECTION }).state).toBe(SelectionSummaryState.None);
  expect(service.cooldown.remainingMs(documentId)).toBe(0);
  expect(callsOf(model)).toBe(0);
  await server.stop();
});

test('a throw while preparing the prompt is a stored failure and the selection key is never logged', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const model = modelAnswering(ANSWER);
  const orphanRun = { ...runBy({ author: BRUNO, inserted: ' a designer', lastServerTime: 2 }), authorKeys: ['user-missing'] };
  const { server, documentId, service, jobRunner } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: [orphanRun] }),
  });
  const key = selectionKeyOf({ selection: BRUNO_SELECTION, binMs: MINUTE_MS });
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({ outcome: SelectionRequestOutcome.Started });
  await jobRunner.idle();
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    state: SelectionSummaryState.Failed,
    failure: SELECTION_SUMMARY_FAILED_MESSAGE,
  });
  expect([...errors.mock.calls, ...warnings.mock.calls].map((call) => JSON.stringify(call)).join('')).not.toContain(key);
  expect(callsOf(model)).toBe(0);
  await server.stop();
});

test('a started request spends one call of the hourly budget', async () => {
  const jobRunner = new InsightsJobRunner({ maxCallsPerHour: 1 });
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(modelAnswering(ANSWER)),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
    jobRunner,
  });
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({ outcome: SelectionRequestOutcome.Started });
  expect(jobRunner.hasCallBudget()).toBe(false);
  await jobRunner.idle();
  await server.stop();
});

test('after a failure at an unchanged stamp a request is retried once the cooldown has passed', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const model = modelAnswering('not json', ANSWER);
  const { server, documentId, service, jobRunner } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  service.request({ documentId, selection: BRUNO_SELECTION });
  await jobRunner.idle();
  expect(service.read({ documentId, selection: BRUNO_SELECTION }).state).toBe(SelectionSummaryState.Failed);
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toMatchObject({ outcome: SelectionRequestOutcome.TooSoon });
  vi.setSystemTime(Date.now() + SELECTION_SUMMARY_COOLDOWN_MS);
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({ outcome: SelectionRequestOutcome.Started });
  await jobRunner.idle();
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    state: SelectionSummaryState.Ready,
    summary: { sentence: ANSWER.sentence },
  });
  await server.stop();
});

test('a failure that cannot be stored is logged without the selection key', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { server, documentId, service, jobRunner } = await serviceWith({
    languageModel: readyModel(failingModel(new Error(PROVIDER_FAILURE))),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  vi.spyOn(server.services.insightsRepository, 'saveSelectionFailure').mockImplementation(() => {
    throw new Error(FOREIGN_KEY_FAILURE);
  });
  const key = selectionKeyOf({ selection: BRUNO_SELECTION, binMs: MINUTE_MS });
  expect(service.request({ documentId, selection: BRUNO_SELECTION })).toEqual({ outcome: SelectionRequestOutcome.Started });
  await jobRunner.idle();
  expect(errors.mock.calls.map((call) => JSON.stringify(call)).join('')).not.toContain(key);
  await server.stop();
});
