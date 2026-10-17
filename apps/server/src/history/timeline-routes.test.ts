import {
  AgentActionKind,
  ClientActor,
  type BinEdits,
  DocumentResource,
  HOUR_MS,
  DAY_MS,
  MINUTE_MS,
  SECOND_MS,
  WEEK_MS,
  documentApiPath,
  HttpStatus,
  selectionSummaryApiPath,
  timelineEditsApiPath,
  TimelineBandKind,
  TimelineQueryParam,
  UTC_TIME_ZONE,
  type DocumentTimeline,
} from '@superdoc-collab/types';
import { chooseBinMs, MAX_BINS } from '@superdoc-collab/history';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { connectToDocument, documentWithOwner } from '../testing/collaboration-client';
import { TimelinePipelineCache } from './timeline-pipeline-cache';
import { INVALID_TIMELINE_QUERY_MESSAGE } from './timeline-query';
import { commitBulkEvents, readTimeline, twoAuthorsInTwoBlocks, zonedQuery } from '../testing/timeline-client';
import { signedInUser, type TestServer } from '../testing/test-server';

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
const MULTI_WEEK_BIN_MS = 3 * WEEK_MS;

function timelineUrl({ server, documentId, query }: { server: { baseUrl: string }; documentId: string; query: string }): string {
  return `${server.baseUrl}${documentApiPath({ documentId, resource: DocumentResource.Timeline })}?${zonedQuery({ query })}`;
}

function editsUrl({
  server,
  documentId,
  query,
  timeZone,
}: {
  server: { baseUrl: string };
  documentId: string;
  query: string;
  timeZone?: string;
}): string {
  return `${server.baseUrl}${timelineEditsApiPath(documentId)}?${zonedQuery({ query, timeZone })}`;
}

const ZONELESS_PATHS = [
  ['timeline', (documentId: string) => documentApiPath({ documentId, resource: DocumentResource.Timeline })],
  ['edits', (documentId: string) => `${timelineEditsApiPath(documentId)}?binStart=0`],
  ['selection', (documentId: string) => selectionSummaryApiPath(documentId)],
] as const;
const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';
const SAO_PAULO_OFFSET_MS = -3 * HOUR_MS;
const KIRITIMATI_TIME_ZONE = 'Pacific/Kiritimati';
const ZONED_EVENT_COUNT = 40;
const ZONED_STEP_MS = 3 * HOUR_MS;
const UNKNOWN_TIME_ZONE = 'Mars/Olympus';

test.each(ZONELESS_PATHS)('the %s route answers 400 when timeZone is missing or unknown', async (_name, pathOf) => {
  const { server, documentId, owner } = await documentWithOwner();
  const path = `${server.baseUrl}${pathOf(documentId)}`;
  const separator = path.includes('?') ? '&' : '?';
  const missing = await fetch(path, { headers: { cookie: owner.cookie } });
  const unknown = await fetch(`${path}${separator}${TimelineQueryParam.TimeZone}=${encodeURIComponent(UNKNOWN_TIME_ZONE)}`, {
    headers: { cookie: owner.cookie },
  });
  expect([missing.status, unknown.status]).toEqual([HttpStatus.BadRequest, HttpStatus.BadRequest]);
  await server.stop();
});

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
  const response = await fetch(timelineUrl({ server, documentId, query: `term=${encodeURIComponent('a.b*(')}` }), {
    headers: { cookie: owner.cookie },
  });
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
    await fetch(editsUrl({ server, documentId, query: `binStart=${editBin.start}&binMs=${DAY_BIN_MS}` }), {
      headers: { cookie: owner.cookie },
    })
  ).json()) as BinEdits;
  expect(edits.runs.map((run) => run.inserted)).toEqual([' more money', ' a designer']);
  const empty = (await (
    await fetch(editsUrl({ server, documentId, query: `binStart=0&binMs=${DAY_BIN_MS}` }), {
      headers: { cookie: owner.cookie },
    })
  ).json()) as BinEdits;
  expect(empty.runs).toEqual([]);
  expect((await fetch(editsUrl({ server, documentId, query: `binMs=${DAY_BIN_MS}` }), { headers: { cookie: owner.cookie } })).status).toBe(
    HttpStatus.BadRequest,
  );
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
  const editsCall = () => timed(() => fetch(editsUrl({ server, documentId, query: 'binStart=0' }), { headers }));
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
  expect(timeline.authors[agentKey]).toEqual({ id: owner.id, name: 'Ana', actor: ClientActor.Agent });
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
});

test('a Sao Paulo day timeline starts every bin at local midnight and ends where the next starts', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitBulkEvents({ server, documentId, userId: owner.id, count: ZONED_EVENT_COUNT, stepMs: ZONED_STEP_MS });
  const timeline = await readTimeline({
    server,
    documentId,
    cookie: owner.cookie,
    query: `binMs=${DAY_BIN_MS}`,
    timeZone: SAO_PAULO_TIME_ZONE,
  });
  expect(timeline.bins.map((bin) => (bin.start + SAO_PAULO_OFFSET_MS) % DAY_MS)).toEqual(timeline.bins.map(() => 0));
  expect(timeline.bins.slice(0, -1).map((bin, index) => bin.end === timeline.bins[index + 1]!.start)).toEqual(
    timeline.bins.slice(0, -1).map(() => true),
  );
  await server.stop();
});

test('the same document reads different bin starts in UTC and in Kiritimati', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitBulkEvents({ server, documentId, userId: owner.id, count: ZONED_EVENT_COUNT, stepMs: ZONED_STEP_MS });
  const query = `binMs=${DAY_BIN_MS}`;
  const utc = await readTimeline({ server, documentId, cookie: owner.cookie, query, timeZone: UTC_TIME_ZONE });
  const kiritimati = await readTimeline({ server, documentId, cookie: owner.cookie, query, timeZone: KIRITIMATI_TIME_ZONE });
  expect(kiritimati.bins.map((bin) => bin.start)).not.toEqual(utc.bins.map((bin) => bin.start));
  await server.stop();
});

test('edits of a Sao Paulo bin are found by the bin start the timeline returned', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitBulkEvents({ server, documentId, userId: owner.id, count: ZONED_EVENT_COUNT, stepMs: ZONED_STEP_MS });
  const query = `binMs=${DAY_BIN_MS}`;
  const timeline = await readTimeline({ server, documentId, cookie: owner.cookie, query, timeZone: SAO_PAULO_TIME_ZONE });
  const editBin = timeline.bins.find((bin) => Object.keys(bin.byBand).length > 0)!;
  const response = await fetch(
    editsUrl({ server, documentId, query: `${query}&binStart=${editBin.start}`, timeZone: SAO_PAULO_TIME_ZONE }),
    {
      headers: { cookie: owner.cookie },
    },
  );
  expect(((await response.json()) as BinEdits).runs.length).toBeGreaterThan(0);
  await server.stop();
});

test('a case variant of a zone reads the same bins as its canonical name', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitBulkEvents({ server, documentId, userId: owner.id, count: ZONED_EVENT_COUNT, stepMs: ZONED_STEP_MS });
  const query = `binMs=${DAY_BIN_MS}`;
  const canonical = await readTimeline({ server, documentId, cookie: owner.cookie, query, timeZone: SAO_PAULO_TIME_ZONE });
  const variant = await readTimeline({ server, documentId, cookie: owner.cookie, query, timeZone: SAO_PAULO_TIME_ZONE.toLowerCase() });
  expect(variant.bins).toEqual(canonical.bins);
  expect(variant.timeZone).toBe(SAO_PAULO_TIME_ZONE);
  await server.stop();
});

test.each([
  ['timeline', (documentId: string) => documentApiPath({ documentId, resource: DocumentResource.Timeline })],
  ['edits', (documentId: string) => `${timelineEditsApiPath(documentId)}?binStart=0`],
  ['selection', (documentId: string) => selectionSummaryApiPath(documentId)],
] as const)('the %s route accepts a multi-week bin size that chooseBinMs can return', async (_name, pathOf) => {
  const { server, documentId, owner } = await documentWithOwner();
  const path = `${server.baseUrl}${pathOf(documentId)}`;
  const separator = path.includes('?') ? '&' : '?';
  const response = await fetch(`${path}${separator}${zonedQuery({ query: `binMs=${MULTI_WEEK_BIN_MS}` })}`, {
    headers: { cookie: owner.cookie },
  });
  expect(response.status).toBe(HttpStatus.Ok);
  await server.stop();
});

test('a bin size that would cover too many bins for the span answers 400', async () => {
  const { server, documentId, owner } = await documentWithOwner();
  commitBulkEvents({ server, documentId, userId: owner.id, count: ZONED_EVENT_COUNT, stepMs: ZONED_STEP_MS });
  const response = await fetch(timelineUrl({ server, documentId, query: `binMs=${10 * SECOND_MS}` }), {
    headers: { cookie: owner.cookie },
  });
  expect(response.status).toBe(HttpStatus.BadRequest);
  expect(await response.json()).toEqual({ error: INVALID_TIMELINE_QUERY_MESSAGE });
  await server.stop();
});

const REVISION_SPAN_MS = Date.UTC(10_000, 0, 1) - Date.UTC(1900, 0, 1);
const LARGEST_SERVED_BIN_MS = chooseBinMs(REVISION_SPAN_MS);
const CRAFTED_WEEK_MULTIPLE_BIN_MS = 9_007_199_254_528_000;

test('a week multiple above the largest bin an imported span can need is 400, and the largest is served', async () => {
  const { server, documentId, owner } = await twoAuthorsInTwoBlocks();
  const statusOf = async (binMs: number): Promise<number> =>
    (await fetch(timelineUrl({ server, documentId, query: `binMs=${binMs}` }), { headers: { cookie: owner.cookie } })).status;
  expect(await statusOf(LARGEST_SERVED_BIN_MS)).toBe(HttpStatus.Ok);
  expect(await statusOf(LARGEST_SERVED_BIN_MS + WEEK_MS)).toBe(HttpStatus.BadRequest);
  expect(await statusOf(CRAFTED_WEEK_MULTIPLE_BIN_MS)).toBe(HttpStatus.BadRequest);
  await server.stop();
});
