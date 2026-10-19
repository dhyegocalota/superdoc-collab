import {
  ALL_SEQUENCES,
  assignBlocks,
  authorKey,
  binStartsCovering,
  lastEventSequenceAt,
  nextZonedBinStart,
  buildBands,
  buildBins,
  chooseBinMs,
  contributorsByBand,
  filterRuns,
  groupIntoRuns,
  IdentitySource,
  narrowRuns,
  topicBandId,
  versionSequenceAt,
  type BandIdentity,
  type EditRun,
  type TimelineEvent,
  type VersionMarkSummary,
} from '@superdoc-collab/history';
import {
  BlockChangeKind,
  OTHER_BAND_ID,
  OTHER_BAND_NAME,
  TimelineBandKind,
  type BinEdits,
  type DocumentEditEvent,
  type DocumentTimeline,
  type EventAuthor,
  type ProjectionStatus,
  type TimelineFilter,
} from '@superdoc-collab/types';
import type { AppServices } from '../http/app';
import type { RequestedSelection, SelectionSnapshot } from '../insights/selection-summaries-service';
import { readAgentActions } from './agent-action-views';
import { resolveEvents } from './resolved-events';
import type { TimelinePipeline } from './timeline-pipeline-cache';

const PIPELINE_KEY_SEPARATOR = ':';

class AuthorlessEventError extends Error {
  constructor(eventId: number) {
    super(`Edit event ${eventId} has no author.`);
  }
}

function primaryAuthorKey(event: DocumentEditEvent): string {
  const [first] = event.authors.map(authorKey).sort();
  if (!first) throw new AuthorlessEventError(event.id);
  return first;
}

function bandIdentities({ services, documentId, events }: { services: AppServices; documentId: string; events: DocumentEditEvent[] }): {
  identities: BandIdentity[];
  bandOf: (event: DocumentEditEvent) => string;
  hasTopics: boolean;
} {
  const topics = services.insightsRepository.topics(documentId);
  if (topics.length === 0) {
    return {
      identities: Object.entries(authorsOf(events)).map(([id, author]) => ({ id, kind: TimelineBandKind.Author, name: author.name })),
      bandOf: primaryAuthorKey,
      hasTopics: false,
    };
  }
  const assignment = assignBlocks(topics);
  const identities = [
    ...topics.map((topic) => ({ id: topic.id, kind: TimelineBandKind.Topic, name: topic.name })),
    { id: OTHER_BAND_ID, kind: TimelineBandKind.Other, name: OTHER_BAND_NAME },
  ];
  return { identities, bandOf: (event) => topicBandId({ assignment, blockId: event.blockId }), hasTopics: true };
}

function isUnassigned({ event, bandId, hasTopics }: { event: DocumentEditEvent; bandId: string; hasTopics: boolean }): boolean {
  if (event.kind === BlockChangeKind.Removed) return false;
  return !hasTopics || bandId === OTHER_BAND_ID;
}

function toTimelineEvent({ event, bandId }: { event: DocumentEditEvent; bandId: string }): TimelineEvent {
  return {
    sequence: event.sequence,
    serverTime: event.serverTime,
    blockId: event.blockId,
    bandId,
    authorKeys: event.authors.map(authorKey),
    inserted: event.inserted,
    deleted: event.deleted,
  };
}

function buildPipeline({ services, documentId }: { services: AppServices; documentId: string }): TimelinePipeline {
  const { events: stored, cursor } = services.readModel.readWithCursor({ documentName: documentId, afterSequence: null });
  const events = resolveEvents({ services, documentId, stored });
  const { identities, bandOf, hasTopics } = bandIdentities({ services, documentId, events });
  const eventsWithBand = events.map((event) => ({ event, bandId: bandOf(event) }));
  const unassignedEvents = eventsWithBand
    .filter(({ event, bandId }) => isUnassigned({ event, bandId, hasTopics }))
    .map(({ event }) => event);
  return {
    events: eventsWithBand.map(toTimelineEvent),
    identities,
    authors: authorsOf(events),
    hasTopics,
    unassignedFirstSequences: firstSequencesOf(unassignedEvents),
    cursor,
  };
}

function authorsOf(events: DocumentEditEvent[]): Record<string, EventAuthor> {
  return Object.fromEntries(events.flatMap((event) => event.authors.map((author): [string, EventAuthor] => [authorKey(author), author])));
}

function firstSequencesOf(events: DocumentEditEvent[]): number[] {
  const firstByBlock = events.reduce((byBlock, event) => {
    const known = byBlock.get(event.blockId);
    if (known === undefined || event.sequence < known) byBlock.set(event.blockId, event.sequence);
    return byBlock;
  }, new Map<string, number>());
  return [...firstByBlock.values()];
}

function pipelineCacheKey({ services, documentId }: { services: AppServices; documentId: string }): string {
  const cursor = services.readModel.cursor(documentId);
  const clientCount = services.updateLog.clientIdentities(documentId).size;
  const declaredCount = [...services.updateLog.identitySources(documentId).values()].filter(
    (source) => source === IdentitySource.Declared,
  ).length;
  const topicsUpdatedAt = services.insightsRepository.updatedAt(documentId);
  return [cursor, clientCount, declaredCount, topicsUpdatedAt].join(PIPELINE_KEY_SEPARATOR);
}

export function readTimelinePipeline({ services, documentId }: { services: AppServices; documentId: string }): TimelinePipeline {
  return services.timelinePipelines.get({
    documentId,
    key: pipelineCacheKey({ services, documentId }),
    build: () => buildPipeline({ services, documentId }),
  });
}

function matchingAuthorKeys({
  services,
  authors,
  author,
}: {
  services: AppServices;
  authors: Record<string, EventAuthor>;
  author: string | null;
}): Set<string> | null {
  if (author === null) return null;
  const searchText = author.toLocaleLowerCase();
  const entries = Object.entries(authors);
  const contacts = services.documents.userContacts(entries.flatMap(([, eventAuthor]) => (eventAuthor.id === null ? [] : [eventAuthor.id])));
  const matches = entries.filter(([, eventAuthor]) => {
    const contact = eventAuthor.id === null ? undefined : contacts.get(eventAuthor.id);
    const emailMatches = contact !== undefined && contact.email.toLocaleLowerCase().includes(searchText);
    return eventAuthor.name.toLocaleLowerCase().includes(searchText) || emailMatches;
  });
  return new Set(matches.map(([key]) => key));
}

type TimeBounds = { first: number; last: number };

function boundsOfEvents(events: TimelineEvent[]): TimeBounds | null {
  if (events.length === 0) return null;
  return {
    first: events.reduce((earliest, event) => Math.min(earliest, event.serverTime), Number.POSITIVE_INFINITY),
    last: events.reduce((latest, event) => Math.max(latest, event.serverTime), Number.NEGATIVE_INFINITY),
  };
}

function timeBoundsOf({
  services,
  documentId,
  pipeline,
}: {
  services: AppServices;
  documentId: string;
  pipeline: TimelinePipeline;
}): TimeBounds | null {
  const editBounds = boundsOfEvents(pipeline.events);
  const actionBounds = services.agentActions.span(documentId);
  if (editBounds === null) return actionBounds;
  if (actionBounds === null) return editBounds;
  return { first: Math.min(editBounds.first, actionBounds.first), last: Math.max(editBounds.last, actionBounds.last) };
}

function spanOfBins({
  binStarts,
  binMs,
  timeZone,
}: {
  binStarts: number[];
  binMs: number;
  timeZone: string;
}): { from: number; until: number } | null {
  const first = binStarts[0];
  const last = binStarts.at(-1);
  if (first === undefined || last === undefined) return null;
  return { from: first, until: nextZonedBinStart({ start: last, binMs, timeZone }) };
}

function projectionStatus({ services, documentId }: { services: AppServices; documentId: string }): ProjectionStatus {
  const cursor = services.readModel.cursor(documentId);
  const [next] = services.updateLog.readBatch({
    documentName: documentId,
    afterSequence: cursor === null ? ALL_SEQUENCES : cursor,
    limit: 1,
  });
  const isDegraded = services.scheduler.isDegraded;
  if (!next) return { isBehind: false, lagMs: null, isDegraded, cursor };
  return { isBehind: true, lagMs: Date.now() - next.serverTime, isDegraded, cursor };
}

function binMsOf({ binMs, bounds }: { binMs: number | null; bounds: TimeBounds | null }): number {
  if (binMs !== null) return binMs;
  if (bounds === null) return chooseBinMs(0);
  return chooseBinMs(bounds.last - bounds.first);
}

function matchedRunsOf({
  services,
  pipeline,
  filter,
  binMs,
  timeZone,
}: {
  services: AppServices;
  pipeline: TimelinePipeline;
  filter: TimelineFilter;
  binMs: number;
  timeZone: string;
}): { allRuns: EditRun[]; matchedRuns: EditRun[] } {
  const allRuns = groupIntoRuns({ events: pipeline.events, binMs, timeZone });
  return {
    allRuns,
    matchedRuns: filterRuns({
      runs: allRuns,
      term: filter.term,
      authorKeys: matchingAuthorKeys({ services, authors: pipeline.authors, author: filter.author }),
    }),
  };
}

export function buildDocumentTimeline({
  services,
  documentId,
  filter,
  binMs,
  timeZone,
}: {
  services: AppServices;
  documentId: string;
  filter: TimelineFilter;
  binMs: number | null;
  timeZone: string;
}): DocumentTimeline {
  const pipeline = readTimelinePipeline({ services, documentId });
  const bounds = timeBoundsOf({ services, documentId, pipeline });
  const chosenBinMs = binMsOf({ binMs, bounds });
  const { allRuns, matchedRuns } = matchedRunsOf({ services, pipeline, filter, binMs: chosenBinMs, timeZone });
  const marks = services.readModel.marks(documentId);
  const binStarts =
    bounds === null ? [] : binStartsCovering({ firstTime: bounds.first, lastTime: bounds.last, binMs: chosenBinMs, timeZone });
  const agentActions = readAgentActions({
    services,
    documentId,
    span: spanOfBins({ binStarts, binMs: chosenBinMs, timeZone }),
  });
  const authors = { ...pipeline.authors, ...agentActions.authors };
  const matchingKeys = matchingAuthorKeys({ services, authors, author: filter.author });
  return {
    timeZone,
    binMs: chosenBinMs,
    bins: buildBins({
      runs: matchedRuns,
      binStarts,
      binMs: chosenBinMs,
      timeZone,
      versionSequenceAt: (time) => versionSequenceOf({ events: pipeline.events, marks, time }),
    }),
    bands: buildBands({ identities: pipeline.identities, allRuns, matchedRuns }),
    contributorsByBand: contributorsByBand(matchedRuns),
    authors,
    agentActions: agentActions.actions.filter((action) => matchingKeys === null || matchingKeys.has(action.authorKey)),
    topics: services.insights.topics.status(documentId),
    projection: projectionStatus({ services, documentId }),
  };
}

// NB ADR 0043: a bin opens the exact sequence of its last event; only a bin before every event falls back to the first mark.
function versionSequenceOf({ events, marks, time }: { events: TimelineEvent[]; marks: VersionMarkSummary[]; time: number }): number | null {
  const eventSequence = lastEventSequenceAt({ events, time });
  if (eventSequence !== null) return eventSequence;
  return versionSequenceAt({ marks, time });
}

export function buildBinEdits({
  services,
  documentId,
  filter,
  binStart,
  binMs,
  timeZone,
}: {
  services: AppServices;
  documentId: string;
  filter: TimelineFilter;
  binStart: number;
  binMs: number | null;
  timeZone: string;
}): BinEdits {
  const pipeline = readTimelinePipeline({ services, documentId });
  const chosenBinMs = binMsOf({ binMs, bounds: timeBoundsOf({ services, documentId, pipeline }) });
  const { matchedRuns } = matchedRunsOf({ services, pipeline, filter, binMs: chosenBinMs, timeZone });
  const runs = matchedRuns
    .filter((run) => run.binStart === binStart)
    .map(({ blockId, bandId, authorKeys, inserted, deleted, lastServerTime, versionSequence }) => ({
      blockId,
      bandId,
      authorKeys,
      inserted,
      deleted,
      lastServerTime,
      versionSequence,
    }));
  const authorKeys = new Set(runs.flatMap((run) => run.authorKeys));
  const authors = Object.fromEntries(Object.entries(pipeline.authors).filter(([key]) => authorKeys.has(key)));
  return { binStart, binMs: chosenBinMs, runs, authors };
}

function topicsUpdatedAtFor({
  services,
  documentId,
  selection,
}: {
  services: AppServices;
  documentId: string;
  selection: RequestedSelection;
}): number | null {
  if (selection.topic === null) return null;
  return services.insightsRepository.updatedAt(documentId);
}

export function buildSelectionSnapshot({
  services,
  documentId,
  selection,
}: {
  services: AppServices;
  documentId: string;
  selection: RequestedSelection;
}): SelectionSnapshot {
  const pipeline = readTimelinePipeline({ services, documentId });
  const binMs = binMsOf({ binMs: selection.binMs, bounds: timeBoundsOf({ services, documentId, pipeline }) });
  const { matchedRuns } = matchedRunsOf({ services, pipeline, filter: selection, binMs, timeZone: selection.timeZone });
  return {
    runs: narrowRuns({ runs: matchedRuns, bandId: selection.topic, binStart: selection.at }),
    authors: pipeline.authors,
    binMs,
    cursor: pipeline.cursor,
    topicsUpdatedAt: topicsUpdatedAtFor({ services, documentId, selection }),
  };
}
