import {
  AgentActionKind,
  ClientActor,
  type BinEdits,
  DocumentResource,
  MINUTE_MS,
  documentApiPath,
  HttpStatus,
  timelineEditsApiPath,
  TimelineBandKind,
  type DocumentTimeline,
} from '@superdoc-history/types';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { connectToDocument, documentWithOwner } from '../testing/collaboration-client';
import { TimelinePipelineCache } from './timeline-pipeline-cache';
import { commitBulkEvents, readTimeline, twoAuthorsInTwoBlocks } from '../testing/timeline-client';
import { signedInUser, type TestServer } from '../testing/test-server';
import { MAX_BINS } from '@superdoc-history/history';

const HOUR_MS = 60 * MINUTE_MS;
const AFTER_LAST_BIN_COUNT = 5;
const BULK_START = Date.UTC(2026, 0, 1);
const DAY_BIN_MS = 1440 * MINUTE_MS;
const LATENCY_BUDGET_MS = 150;
const CI_ENVIRONMENT_VARIABLE = 'CI';
const isContinuousIntegration = Boolean(process.env[CI_ENVIRONMENT_VARIABLE]);
const BULK_EVENTS = 10_000;
const BULK_BLOCKS = 600;
const OFF_LADDER_BIN_MS = 61_000;
const TWO_MINUTE_BIN_MS = 2 * MINUTE_MS;

function timelineUrl({ server, documentId, query }: { server: { baseUrl: string }; documentId: string; query: string }): string {
  return `${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Timeline })}?${query}`;
}

test('filters by author name or email and keeps the x axis', async () => {
  const { server, documentId, owner, editor } = await twoAuthorsInTwoBlocks();
  const all = await readTimeline({ server, documentId, cookie: owner.cookie });
  const byEmail = await readTimeline({
    server,
    documentId,
    cookie: owner.cookie,
    query: `author=${encodeURIComponent(editor.email.toUpperCase())}`,
  });
  expect(byEmail.bins.map((bin) => bin.start)).toEqual(all.bins.map((bin) => bin.start));
  expect(
    Object.keys(byEmail.contributorsByBand).flatMap((bandId) =>
      byEmail.contributorsByBand[bandId]!.map((contributor) => contributor.authorKey),
    ),
  ).toEqual([editor.id]);
  await server.stop();
});

test('term=a.b*( narrows without a 500', async () => {
  const { server, documentId, owner } = await twoAuthorsInTwoBlocks();
  const response = await fetch(
    `${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Timeline })}?term=${encodeURIComponent('a.b*(')}`,
    { headers: { cookie: owner.cookie } },
  );
  expect(response.status).toBe(HttpStatus.Ok);
  expect(((await response.json()) as DocumentTimeline).bands.every((band) => band.volume === 0)).toBe(true);
  await server.stop();
});

test('without topics the bands are authors', async () => {
  const { server, documentId, owner } = await twoAuthorsInTwoBlocks();
  const timeline = await readTimeline({ server, documentId, cookie: owner.cookie });
  expect(timeline.bands.map((band) => band.kind)).toEqual([TimelineBandKind.Author, TimelineBandKind.Author]);
  expect(timeline.bands.map((band) => band.name).sort()).toEqual(['Ana', 'Member']);
  await server.stop();
});

test('with stored topics the bands are topics and unassigned blocks fall into Other', async () => {
  const { server, documentId, owner, editor } = await twoAuthorsInTwoBlocks();
  server.services.insightsRepository.saveTopics({
    documentId,
    topics: [{ id: null, name: 'Budget', blockIds: ['b0'] }],
    computedAtSequence: 1,
  });
  const timeline = await readTimeline({ server, documentId, cookie: owner.cookie });
  expect(timeline.bands.map((band) => [band.kind, band.name])).toEqual([
    [TimelineBandKind.Topic, 'Budget'],
    [TimelineBandKind.Other, 'Other'],
  ]);
  const other = timeline.bands.find((band) => band.kind === TimelineBandKind.Other)!;
  expect(timeline.contributorsByBand[other.id]!.map((contributor) => contributor.authorKey)).toEqual([editor.id]);
  await server.stop();
});

test('a fixed binMs outside the ladder is 400', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  expect(
    (await fetch(timelineUrl({ server, documentId, query: `binMs=${OFF_LADDER_BIN_MS}` }), { headers: { cookie: owner.cookie } })).status,
  ).toBe(HttpStatus.BadRequest);
  const accepted = await fetch(timelineUrl({ server, documentId, query: `binMs=${TWO_MINUTE_BIN_MS}` }), {
    headers: { cookie: owner.cookie },
  });
  expect(accepted.status).toBe(HttpStatus.Ok);
  expect(((await accepted.json()) as DocumentTimeline).binMs).toBe(TWO_MINUTE_BIN_MS);
  await server.stop();
});

test('projection status carries the cursor the timeline was built from', async () => {
  const { server, documentId, owner } = await twoAuthorsInTwoBlocks();
  await expect.poll(async () => (await readTimeline({ server, documentId, cookie: owner.cookie })).projection.isBehind).toBe(false);
  const timeline = await readTimeline({ server, documentId, cookie: owner.cookie });
  expect(timeline.projection.cursor).not.toBeNull();
  expect(timeline.projection.cursor).toBe(server.services.readModel.cursor(documentId));
  await server.stop();
});

test('projection status reports a lag', async () => {
  const { server, documentId, owner } = await twoAuthorsInTwoBlocks();
  server.services.scheduler.isDegraded = true;
  const client = await connectToDocument({ server, cookie: owner.cookie, documentId });
  client.document.getText('lag').insert(0, 'x');
  await expect.poll(async () => (await readTimeline({ server, documentId, cookie: owner.cookie })).projection.isBehind).toBe(true);
  expect((await readTimeline({ server, documentId, cookie: owner.cookie })).projection.isDegraded).toBe(true);
  server.services.scheduler.isDegraded = false;
  client.close();
  await server.stop();
});

test('edits lists the runs of one bin', async () => {
  const { server, documentId, owner } = await twoAuthorsInTwoBlocks();
  const timeline = await readTimeline({ server, documentId, cookie: owner.cookie, query: `binMs=${DAY_BIN_MS}` });
  const editBin = timeline.bins.find((bin) => Object.keys(bin.byBand).length > 0)!;
  const edits = (await (
    await fetch(`${server.baseUrl}${timelineEditsApiPath(documentId)}?binStart=${editBin.start}&binMs=${DAY_BIN_MS}`, {
      headers: { cookie: owner.cookie },
    })
  ).json()) as BinEdits;
  expect(edits.runs.map((run) => run.inserted)).toEqual([' more money', ' a designer']);
  const empty = (await (
    await fetch(`${server.baseUrl}${timelineEditsApiPath(documentId)}?binStart=0&binMs=${DAY_BIN_MS}`, {
      headers: { cookie: owner.cookie },
    })
  ).json()) as BinEdits;
  expect(empty.runs).toEqual([]);
  expect(
    (await fetch(`${server.baseUrl}${timelineEditsApiPath(documentId)}?binMs=${DAY_BIN_MS}`, { headers: { cookie: owner.cookie } })).status,
  ).toBe(HttpStatus.BadRequest);
  await server.stop();
});

test('a non-member gets the same 404 on timeline and edits', async () => {
  const { server, documentId } = await documentWithOwner();
  const stranger = await signedInUser({ server, name: 'Stranger' });
  const unknownId = randomUUID();
  const urls = (id: string) => [
    timelineUrl({ server, documentId: id, query: '' }),
    `${server.baseUrl}${timelineEditsApiPath(id)}?binStart=0`,
  ];
  const responses = await Promise.all(
    [...urls(documentId), ...urls(unknownId)].map((url) => fetch(url, { headers: { cookie: stranger.cookie } })),
  );
  expect(responses.map((response) => response.status)).toEqual([
    HttpStatus.NotFound,
    HttpStatus.NotFound,
    HttpStatus.NotFound,
    HttpStatus.NotFound,
  ]);
  const bodies = await Promise.all(responses.map((response) => response.json()));
  expect(bodies[0]).toEqual(bodies[2]);
  expect(bodies[1]).toEqual(bodies[3]);
  await server.stop();
});

async function timed(request: () => Promise<Response>): Promise<number> {
  const start = performance.now();
  const response = await request();
  await response.arrayBuffer();
  return performance.now() - start;
}

test('ten thousand events build one pipeline per cursor and answer within the local latency budget', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitBulkEvents({ server, documentId, userId: owner.id, count: BULK_EVENTS, blockCount: BULK_BLOCKS });
  const headers = { cookie: owner.cookie };
  const timelineCall = () => timed(() => fetch(timelineUrl({ server, documentId, query: '' }), { headers }));
  const editsCall = () => timed(() => fetch(`${server.baseUrl}${timelineEditsApiPath(documentId)}?binStart=0`, { headers }));
  const durations = [await timelineCall(), await timelineCall(), await editsCall()];
  if (!isContinuousIntegration) durations.forEach((duration) => expect(duration).toBeLessThan(LATENCY_BUDGET_MS));
  expect(server.services.timelinePipelines.builds).toBe(1);
  commitBulkEvents({ server, documentId, userId: owner.id, count: 1, startIndex: BULK_EVENTS, blockCount: BULK_BLOCKS });
  await timelineCall();
  await timelineCall();
  expect(server.services.timelinePipelines.builds).toBe(2);
  await server.stop();
});

test('forgetting a document drops its cached pipeline', () => {
  const cache = new TimelinePipelineCache();
  const pipeline = { events: [], identities: [], authors: {}, hasTopics: false, unassignedFirstSequences: [], cursor: null };
  Array.from({ length: 2 }).forEach(() => cache.get({ documentId: 'd1', key: 'k', build: () => pipeline }));
  expect(cache.builds).toBe(1);
  cache.forget('d1');
  cache.get({ documentId: 'd1', key: 'k', build: () => pipeline });
  expect(cache.builds).toBe(2);
});

test('the pipeline cache evicts the least recently read document', () => {
  const cache = new TimelinePipelineCache({ maxEntries: 2 });
  const pipeline = { events: [], identities: [], authors: {}, hasTopics: false, unassignedFirstSequences: [], cursor: null };
  const read = (documentId: string) => cache.get({ documentId, key: 'k', build: () => pipeline });
  ['d1', 'd2', 'd1', 'd3'].forEach(read);
  expect(cache.builds).toBe(3);
  read('d1');
  expect(cache.builds).toBe(3);
  read('d2');
  expect(cache.builds).toBe(4);
});

function recordAction({
  server,
  documentId,
  userId,
  createdAt,
}: {
  server: TestServer;
  documentId: string;
  userId: string;
  createdAt: number;
}) {
  server.services.agentActions.record({ documentName: documentId, userId, kind: AgentActionKind.DocumentExported, createdAt });
}

function coversTime({ timeline, time }: { timeline: DocumentTimeline; time: number }): boolean {
  return timeline.bins.some((bin) => bin.start <= time && time < bin.start + timeline.binMs);
}

test('an action between the edits comes back with the agent author', async () => {
  const { server, documentId, owner } = await twoAuthorsInTwoBlocks();
  const quiet = await readTimeline({ server, documentId, cookie: owner.cookie });
  expect(quiet.agentActions).toEqual([]);
  expect(quiet.bins.every((bin) => Object.values(bin.byBand).every((cell) => cell.agentInserted === 0))).toBe(true);
  const createdAt = quiet.bins[1]!.start;
  recordAction({ server, documentId, userId: owner.id, createdAt });
  const timeline = await readTimeline({ server, documentId, cookie: owner.cookie });
  const agentKey = `${owner.id}#agent`;
  expect(timeline.agentActions).toEqual([{ authorKey: agentKey, kind: AgentActionKind.DocumentExported, createdAt }]);
  expect(timeline.authors[agentKey]).toEqual({ id: owner.id, name: 'Ana · AI', actor: ClientActor.Agent });
  await server.stop();
});

test('an action after the last edit gets a bin and a mark', async () => {
  const { server, documentId, owner } = await twoAuthorsInTwoBlocks();
  const quiet = await readTimeline({ server, documentId, cookie: owner.cookie });
  const createdAt = quiet.bins.at(-1)!.start + quiet.binMs * AFTER_LAST_BIN_COUNT;
  recordAction({ server, documentId, userId: owner.id, createdAt });
  const timeline = await readTimeline({ server, documentId, cookie: owner.cookie });
  expect(timeline.agentActions.map((action) => action.createdAt)).toEqual([createdAt]);
  expect(coversTime({ timeline, time: createdAt })).toBe(true);
  expect(timeline.bins.length).toBeLessThanOrEqual(MAX_BINS);
  await server.stop();
});

test('a document with only agent actions shows its marks', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  const times = [BULK_START, BULK_START + HOUR_MS];
  times.forEach((createdAt) => recordAction({ server, documentId, userId: owner.id, createdAt }));
  const timeline = await readTimeline({ server, documentId, cookie: owner.cookie });
  expect(timeline.agentActions.map((action) => action.createdAt)).toEqual(times);
  times.forEach((time) => expect(coversTime({ timeline, time })).toBe(true));
  await server.stop();
});

test('the author filter keeps only the marks of the matching authors, a person email matches their AI', async () => {
  const { server, documentId, owner, editor } = await twoAuthorsInTwoBlocks();
  const quiet = await readTimeline({ server, documentId, cookie: owner.cookie });
  recordAction({ server, documentId, userId: owner.id, createdAt: quiet.bins[1]!.start });
  recordAction({ server, documentId, userId: editor.id, createdAt: quiet.bins[1]!.start + 1 });
  const byEditorEmail = await readTimeline({
    server,
    documentId,
    cookie: owner.cookie,
    query: `author=${encodeURIComponent(editor.email.toUpperCase())}`,
  });
  expect(byEditorEmail.agentActions.map((action) => action.authorKey)).toEqual([`${editor.id}#agent`]);
  const byTerm = await readTimeline({ server, documentId, cookie: owner.cookie, query: 'term=nothing-matches-this' });
  expect(byTerm.agentActions).toHaveLength(2);
  await server.stop();
});
