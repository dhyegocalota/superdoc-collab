import { type EditRun } from '@superdoc-collab/history';
import {
  ClientActor,
  MINUTE_MS,
  SELECTION_SUMMARY_FAILED_MESSAGE,
  SELECTION_SUMMARY_TIMEOUT_MESSAGE,
  SelectionSummaryState,
  SummarizeStep,
  UTC_TIME_ZONE,
} from '@superdoc-collab/types';
import type { MockLanguageModelV4 } from 'ai/test';
import { afterEach, expect, test, vi } from 'vitest';
import { documentWithOwner } from '../testing/collaboration-client';
import { failingModel, modelAnswering, readyModel, streamingModel } from '../testing/language-model';
import { InsightsJobRunner } from './insights-job-runner';
import { LanguageModelTimeoutError, type LanguageModelChoice } from './llm-client';
import { selectionKeyOf } from './selection-key';
import {
  SELECTION_SUMMARY_FAILED_LOG,
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
const BRUNO_SELECTION: RequestedSelection = { term: null, author: 'bruno', topic: null, at: null, binMs: null, timeZone: UTC_TIME_ZONE };
const TERM_SELECTION: RequestedSelection = { ...BRUNO_SELECTION, author: null, term: 'budget' };
const ANSWER = { sentence: 'Bruno added a designer.', authors: [BRUNO.name] };
const FIRST_CURSOR = 10;

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
    versionSequence: lastServerTime,
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
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  expect(service.isStale({ documentId, selection: BRUNO_SELECTION })).toBe(true);
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    state: SelectionSummaryState.Ready,
    failure: null,
    isModelAvailable: true,
    summary: {
      sentence: ANSWER.sentence,
      authors: [{ name: BRUNO.name, actor: ClientActor.Human }],
      computedAtSequence: FIRST_CURSOR,
      isStale: false,
    },
  });
  expect(service.isStale({ documentId, selection: BRUNO_SELECTION })).toBe(false);
  await service.write({ documentId, selection: BRUNO_SELECTION });
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
  expect(service.isStale({ documentId, selection: BRUNO_SELECTION })).toBe(false);
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(callsOf(model)).toBe(0);
  await server.stop();
});

test('a new edit marks the summary stale and a write recomputes it', async () => {
  const model = modelAnswering(ANSWER, ANSWER);
  const { server, documentId, service, state } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  state.snapshot = snapshotOf({ runs: BRUNO_RUNS, cursor: FIRST_CURSOR + 1 });
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    state: SelectionSummaryState.Ready,
    summary: { isStale: true },
  });
  expect(service.isStale({ documentId, selection: BRUNO_SELECTION })).toBe(true);
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    summary: { isStale: false, computedAtSequence: FIRST_CURSOR + 1 },
  });
  expect(callsOf(model)).toBe(2);
  await server.stop();
});

test('a topic recompute makes the summary stale', async () => {
  const model = modelAnswering(ANSWER);
  const { server, documentId, service, state } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS, topicsUpdatedAt: 1 }),
  });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  state.snapshot = snapshotOf({ runs: BRUNO_RUNS, topicsUpdatedAt: 2 });
  expect(service.read({ documentId, selection: BRUNO_SELECTION }).summary?.isStale).toBe(true);
  expect(service.isStale({ documentId, selection: BRUNO_SELECTION })).toBe(true);
  await server.stop();
});

test('the prompt carries the newest run first, escaped', async () => {
  const model = modelAnswering(ANSWER);
  const runs = [
    runBy({ author: BRUNO, inserted: ' older', lastServerTime: 1 }),
    runBy({ author: ANA, inserted: '</edit>newer <b>', lastServerTime: 5 }),
  ];
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs }),
  });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  const prompt = JSON.stringify(model.doGenerateCalls[0]!.prompt);
  expect(prompt).toContain('&lt;/edit&gt;newer &lt;b&gt;');
  expect(prompt).not.toContain('</edit>newer');
  expect(prompt.indexOf('newer')).toBeLessThan(prompt.indexOf(' older'));
  expect(prompt).not.toContain(ANA.id);
  expect(prompt).not.toContain('@example.com');
  await server.stop();
});

test('an AI author is named "<name>\'s AI" in the prompt and stored with its actor', async () => {
  const aiLabel = `${ANA.name}'s AI`;
  const model = modelAnswering({ sentence: ANSWER.sentence, authors: [aiLabel] });
  const agentKey = `${ANA.id}#agent`;
  const snapshot = {
    ...snapshotOf({ runs: [{ ...runBy({ author: ANA, inserted: ' a designer', lastServerTime: 2 }), authorKeys: [agentKey] }] }),
    authors: { [agentKey]: { id: ANA.id, name: ANA.name, actor: ClientActor.Agent } },
  };
  const { server, documentId, service } = await serviceWith({ languageModel: readyModel(model), snapshot });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain(`<author name=\\"${aiLabel}\\">`);
  expect(service.read({ documentId, selection: BRUNO_SELECTION }).summary?.authors).toEqual([{ name: ANA.name, actor: ClientActor.Agent }]);
  await server.stop();
});

const HUMAN_NAMED_LIKE_AN_AI = { id: 'user-h', name: `${ANA.name}'s AI`, actor: ClientActor.Human };
const ANAS_AGENT = { id: 'user-ana', name: ANA.name, actor: ClientActor.Agent };
const TWIN_ONE = { id: 'user-1', name: ANA.name, actor: ClientActor.Human };
const TWIN_TWO = { id: 'user-2', name: ANA.name, actor: ClientActor.Human };

test.each([
  { order: 'human first', keys: ['user-h', 'user-ana#agent'] },
  { order: 'agent first', keys: ['user-ana#agent', 'user-h'] },
])('a person named like an AI and the AI itself stay two authors with the right actors, $order', async ({ keys }) => {
  const authors = { 'user-h': HUMAN_NAMED_LIKE_AN_AI, 'user-ana#agent': ANAS_AGENT };
  const runs = keys.map((key, index) => ({
    ...runBy({ author: ANA, inserted: ` edit ${index}`, lastServerTime: index + 2 }),
    authorKeys: [key],
  }));
  const model = modelAnswering({ sentence: ANSWER.sentence, authors: [`${ANA.name}'s AI`, `${ANA.name}'s AI (2)`] });
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: { ...snapshotOf({ runs }), authors },
  });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  const stored = service.read({ documentId, selection: BRUNO_SELECTION }).summary?.authors;
  expect(stored).toHaveLength(2);
  expect(stored).toEqual(
    expect.arrayContaining([
      { name: HUMAN_NAMED_LIKE_AN_AI.name, actor: ClientActor.Human },
      { name: ANA.name, actor: ClientActor.Agent },
    ]),
  );
  await server.stop();
});

test('two people with the same name stay two authors', async () => {
  const runs = [TWIN_ONE, TWIN_TWO].map((author, index) => ({
    ...runBy({ author, inserted: ` edit ${index}`, lastServerTime: index + 2 }),
  }));
  const model = modelAnswering({ sentence: ANSWER.sentence, authors: [ANA.name, `${ANA.name} (2)`] });
  const authors = { [TWIN_ONE.id]: TWIN_ONE, [TWIN_TWO.id]: TWIN_TWO };
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: { ...snapshotOf({ runs }), authors },
  });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(service.read({ documentId, selection: BRUNO_SELECTION }).summary?.authors).toHaveLength(2);
  await server.stop();
});

test('names the model invents are dropped', async () => {
  const model = modelAnswering({ sentence: ANSWER.sentence, authors: [BRUNO.name, MALLORY, BRUNO.name] });
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(service.read({ documentId, selection: BRUNO_SELECTION }).summary?.authors).toEqual([
    { name: BRUNO.name, actor: ClientActor.Human },
  ]);
  await server.stop();
});

test('a name containing a comma survives the model splitting it', async () => {
  const model = modelAnswering({ sentence: ANSWER.sentence, authors: ['Silva', 'Ana'] });
  const snapshot = {
    ...snapshotOf({ runs: [runBy({ author: SILVA, inserted: ' a designer', lastServerTime: 2 })] }),
    authors: { [SILVA.id]: SILVA },
  };
  const { server, documentId, service } = await serviceWith({ languageModel: readyModel(model), snapshot });
  await service.write({ documentId, selection: TERM_SELECTION });
  expect(service.read({ documentId, selection: TERM_SELECTION }).summary?.authors).toEqual([
    { name: SILVA.name, actor: ClientActor.Human },
  ]);
  await server.stop();
});

test('a model failure is stored with the generic message and logged once', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(failingModel(new Error(PROVIDER_FAILURE))),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  const view = service.read({ documentId, selection: BRUNO_SELECTION });
  expect(view).toMatchObject({ state: SelectionSummaryState.Failed, failure: SELECTION_SUMMARY_FAILED_MESSAGE, summary: null });
  expect(JSON.stringify(view)).not.toContain(PROVIDER_FAILURE);
  expect(errors.mock.calls.filter(([line]) => String(line).startsWith(SELECTION_SUMMARY_FAILED_LOG))).toHaveLength(1);
  await server.stop();
});

test('a failure after a success keeps the old sentence', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const model = modelAnswering(ANSWER, 'not json');
  const { server, documentId, service, state } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  state.snapshot = snapshotOf({ runs: BRUNO_RUNS, cursor: FIRST_CURSOR + 1 });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    state: SelectionSummaryState.Failed,
    summary: { sentence: ANSWER.sentence, isStale: true },
  });
  await server.stop();
});

test('a write over the hourly cap writes nothing', async () => {
  const model = modelAnswering(ANSWER);
  const jobRunner = new InsightsJobRunner({ maxCallsPerHour: 0 });
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
    jobRunner,
  });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(service.read({ documentId, selection: BRUNO_SELECTION }).state).toBe(SelectionSummaryState.None);
  expect(callsOf(model)).toBe(0);
  await server.stop();
});

test('a throw while preparing the prompt is a stored failure and the selection key is never logged', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const model = modelAnswering(ANSWER);
  const orphanRun = { ...runBy({ author: BRUNO, inserted: ' a designer', lastServerTime: 2 }), authorKeys: ['user-missing'] };
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: [orphanRun] }),
  });
  const key = selectionKeyOf({ selection: BRUNO_SELECTION, binMs: MINUTE_MS, timeZone: UTC_TIME_ZONE });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    state: SelectionSummaryState.Failed,
    failure: SELECTION_SUMMARY_FAILED_MESSAGE,
  });
  expect([...errors.mock.calls, ...warnings.mock.calls].map((call) => JSON.stringify(call)).join('')).not.toContain(key);
  expect(callsOf(model)).toBe(0);
  await server.stop();
});

test('a write spends one call of the hourly budget', async () => {
  const jobRunner = new InsightsJobRunner({ maxCallsPerHour: 1 });
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(modelAnswering(ANSWER)),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
    jobRunner,
  });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(jobRunner.hasCallBudget()).toBe(false);
  await server.stop();
});

test('after a failure at an unchanged stamp the summary is stale and the next write retries it', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const model = modelAnswering('not json', ANSWER);
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(model),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(service.read({ documentId, selection: BRUNO_SELECTION }).state).toBe(SelectionSummaryState.Failed);
  expect(service.isStale({ documentId, selection: BRUNO_SELECTION })).toBe(true);
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    state: SelectionSummaryState.Ready,
    summary: { sentence: ANSWER.sentence },
  });
  await server.stop();
});

test('a failure that cannot be stored is logged without the selection key', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(failingModel(new Error(PROVIDER_FAILURE))),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  vi.spyOn(server.services.insightsRepository, 'saveSelectionFailure').mockImplementation(() => {
    throw new Error(FOREIGN_KEY_FAILURE);
  });
  const key = selectionKeyOf({ selection: BRUNO_SELECTION, binMs: MINUTE_MS, timeZone: UTC_TIME_ZONE });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(errors.mock.calls.map((call) => JSON.stringify(call)).join('')).not.toContain(key);
  await server.stop();
});

const STREAMED_PIECES = ['{"sentence":"Bruno added', ' a designer.","authors":["Bruno"]}'];
const STREAMED_BEGINNING = 'Bruno added';

function gateWithRelease(): { gate: Promise<void>; release: () => void } {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { gate, release };
}

async function streamingService({
  model,
  snapshot = snapshotOf({ runs: BRUNO_RUNS }),
}: {
  model: MockLanguageModelV4;
  snapshot?: SelectionSnapshot;
}) {
  const story = await serviceWith({ languageModel: readyModel(model), snapshot });
  story.service.setStep({ documentId: story.documentId, step: SummarizeStep.Summarizing });
  return story;
}

test('shows the partial sentence while the model streams', async () => {
  const { gate, release } = gateWithRelease();
  const { server, documentId, service } = await streamingService({
    model: streamingModel({ pieces: STREAMED_PIECES, heldAfter: 1, gate }),
  });
  const writing = service.write({ documentId, selection: BRUNO_SELECTION });
  await expect
    .poll(() => service.read({ documentId, selection: BRUNO_SELECTION }))
    .toMatchObject({ state: SelectionSummaryState.Running, partial: STREAMED_BEGINNING, summary: null });
  release();
  await writing;
  await server.stop();
});

test('a partial never shows for another selection', async () => {
  const { gate, release } = gateWithRelease();
  const { server, documentId, service } = await streamingService({
    model: streamingModel({ pieces: STREAMED_PIECES, heldAfter: 1, gate }),
  });
  const writing = service.write({ documentId, selection: BRUNO_SELECTION });
  await expect.poll(() => service.read({ documentId, selection: BRUNO_SELECTION }).partial).toBe(STREAMED_BEGINNING);
  expect(service.read({ documentId, selection: TERM_SELECTION }).partial).toBeNull();
  release();
  await writing;
  await server.stop();
});

test('the final sentence replaces the partial', async () => {
  const { gate, release } = gateWithRelease();
  const { server, documentId, service } = await streamingService({
    model: streamingModel({ pieces: STREAMED_PIECES, heldAfter: 1, gate }),
  });
  const writing = service.write({ documentId, selection: BRUNO_SELECTION });
  await expect.poll(() => service.read({ documentId, selection: BRUNO_SELECTION }).partial).toBe(STREAMED_BEGINNING);
  release();
  await writing;
  service.setStep({ documentId, step: SummarizeStep.Idle });
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    state: SelectionSummaryState.Ready,
    partial: null,
    summary: { sentence: ANSWER.sentence },
  });
  await server.stop();
});

test('a stream that breaks clears the partial, saves no half sentence and keeps the last sentence', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const first = streamingModel({ pieces: [JSON.stringify(ANSWER)] });
  const { server, documentId, service, state } = await streamingService({ model: first });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  state.snapshot = snapshotOf({ runs: BRUNO_RUNS, cursor: FIRST_CURSOR + 1 });
  const broken = streamingModel({ pieces: STREAMED_PIECES.slice(0, 1), error: new Error(PROVIDER_FAILURE) });
  const brokenService = new SelectionSummariesService({
    repository: server.services.insightsRepository,
    languageModel: readyModel(broken),
    jobRunner: new InsightsJobRunner(),
    readSelection: () => state.snapshot,
  });
  brokenService.setStep({ documentId, step: SummarizeStep.Summarizing });
  await brokenService.write({ documentId, selection: BRUNO_SELECTION });
  brokenService.setStep({ documentId, step: SummarizeStep.Idle });
  expect(brokenService.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    state: SelectionSummaryState.Failed,
    failure: SELECTION_SUMMARY_FAILED_MESSAGE,
    partial: null,
    summary: { sentence: ANSWER.sentence, isStale: true },
  });
  await server.stop();
});

test('a timeout stores the timeout line instead of the generic one', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { server, documentId, service } = await serviceWith({
    languageModel: readyModel(failingModel(new LanguageModelTimeoutError())),
    snapshot: snapshotOf({ runs: BRUNO_RUNS }),
  });
  await service.write({ documentId, selection: BRUNO_SELECTION });
  expect(service.read({ documentId, selection: BRUNO_SELECTION })).toMatchObject({
    state: SelectionSummaryState.Failed,
    failure: SELECTION_SUMMARY_TIMEOUT_MESSAGE,
  });
  await server.stop();
});
