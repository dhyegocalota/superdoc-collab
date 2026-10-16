import { assignBlocks, authorKey, binStartsCovering, buildBands, buildBins, chooseBinMs, contributorsByBand, filterRuns, groupIntoRuns, IdentitySource, topicBandId, versionSequenceAt, type BandIdentity, type EditRun, type TimelineEvent } from '@superdoc-history/history';
import { BlockChangeKind, OTHER_BAND_ID, OTHER_BAND_NAME, TimelineBandKind, TopicState, type BinEdits, type DocumentEditEvent, type DocumentTimeline, type EventAuthor, type ProjectionStatus, type TimelineFilter, type TopicStatus } from '@superdoc-history/types';
import type { AppServices } from '../http/app';
import { resolveEvents } from './resolved-events';
import type { TimelinePipeline } from './timeline-pipeline-cache';

export class AuthorlessEventError extends Error {
  constructor(eventId: number) {
    super(`Edit event ${eventId} has no author.`);
  }
}

function primaryAuthorKey(event: DocumentEditEvent): string {
  const [first] = event.authors.map(authorKey).sort();
  if (!first) throw new AuthorlessEventError(event.id);
  return first;
}

function bandIdentities({ services, documentId, events }: { services: AppServices; documentId: string; events: DocumentEditEvent[] }): { identities: BandIdentity[]; bandOf: (event: DocumentEditEvent) => string; hasTopics: boolean } {
  const topics = services.insightsRepository.topics(documentId);
  if (topics.length === 0) {
    const authors = new Map(events.flatMap((event) => event.authors.map((author): [string, EventAuthor] => [authorKey(author), author])));
    return { identities: [...authors].map(([id, author]) => ({ id, kind: TimelineBandKind.Author, name: author.name })), bandOf: primaryAuthorKey, hasTopics: false };
  }
  const assignment = assignBlocks(topics);
  const identities = [...topics.map((topic) => ({ id: topic.id, kind: TimelineBandKind.Topic, name: topic.name })), { id: OTHER_BAND_ID, kind: TimelineBandKind.Other, name: OTHER_BAND_NAME }];
  return { identities, bandOf: (event) => topicBandId({ assignment, blockId: event.blockId }), hasTopics: true };
}

function buildPipeline({ services, documentId }: { services: AppServices; documentId: string }): TimelinePipeline {
  const { events: stored } = services.readModel.readWithCursor({ documentName: documentId, afterSequence: null });
  const events = resolveEvents({ services, documentId, stored });
  const { identities, bandOf, hasTopics } = bandIdentities({ services, documentId, events });
  const timelineEvents = events.map((event): TimelineEvent => ({ sequence: event.sequence, serverTime: event.serverTime, blockId: event.blockId, bandId: bandOf(event), authorKeys: event.authors.map(authorKey), inserted: event.inserted, deleted: event.deleted }));
  const unassignedBlocks = new Set(events.filter((event, index) => event.kind !== BlockChangeKind.Removed && timelineEvents[index]!.bandId === OTHER_BAND_ID).map((event) => event.blockId));
  const authors = Object.fromEntries(events.flatMap((event) => event.authors.map((author): [string, EventAuthor] => [authorKey(author), author])));
  return { events: timelineEvents, identities, authors, hasTopics, unassignedBlockCount: unassignedBlocks.size };
}

export function pipelineKey({ services, documentId }: { services: AppServices; documentId: string }): string {
  const declaredCount = [...services.log.identitySources(documentId).values()].filter((source) => source === IdentitySource.Declared).length;
  return [services.readModel.cursor(documentId), services.log.clientIdentities(documentId).size, declaredCount, services.insightsRepository.updatedAt(documentId)].join(':');
}

export function readTimelinePipeline({ services, documentId }: { services: AppServices; documentId: string }): TimelinePipeline {
  return services.timelinePipelines.get({ documentId, key: pipelineKey({ services, documentId }), build: () => buildPipeline({ services, documentId }) });
}

function matchingAuthorKeys({ services, pipeline, author }: { services: AppServices; pipeline: TimelinePipeline; author: string | null }): Set<string> | null {
  if (author === null) return null;
  const needle = author.toLocaleLowerCase();
  const entries = Object.entries(pipeline.authors);
  const contacts = services.documents.userContacts(entries.flatMap(([, eventAuthor]) => (eventAuthor.id === null ? [] : [eventAuthor.id])));
  const matches = entries.filter(([key, eventAuthor]) => {
    const contact = contacts.get(key);
    const emailMatches = contact !== undefined && contact.email.toLocaleLowerCase().includes(needle);
    return eventAuthor.name.toLocaleLowerCase().includes(needle) || emailMatches;
  });
  return new Set(matches.map(([key]) => key));
}

function spanOf(events: TimelineEvent[]): number {
  if (events.length === 0) return 0;
  return lastTimeOf(events) - firstTimeOf(events);
}

function firstTimeOf(events: TimelineEvent[]): number {
  return events.reduce((earliest, event) => Math.min(earliest, event.serverTime), Number.POSITIVE_INFINITY);
}

function lastTimeOf(events: TimelineEvent[]): number {
  return events.reduce((latest, event) => Math.max(latest, event.serverTime), Number.NEGATIVE_INFINITY);
}

function topicStatusOf({ services, documentId }: { services: AppServices; documentId: string }): TopicStatus {
  const stored = services.insightsRepository.status(documentId);
  if (stored) return stored;
  return { state: TopicState.Pending, failure: null, computedAtSequence: null };
}

function projectionStatus({ services, documentId }: { services: AppServices; documentId: string }): ProjectionStatus {
  const cursor = services.readModel.cursor(documentId);
  const [next] = services.log.readBatch({ documentName: documentId, afterSequence: cursor === null ? 0 : cursor, limit: 1 });
  const isDegraded = services.scheduler.degraded;
  if (!next) return { isBehind: false, lagMs: null, isDegraded };
  return { isBehind: true, lagMs: Date.now() - next.serverTime, isDegraded };
}

function binMsOf({ binMs, pipeline }: { binMs: number | null; pipeline: TimelinePipeline }): number {
  if (binMs === null) return chooseBinMs(spanOf(pipeline.events));
  return binMs;
}

function matchedRunsOf({ services, pipeline, filter, binMs }: { services: AppServices; pipeline: TimelinePipeline; filter: TimelineFilter; binMs: number }): { allRuns: EditRun[]; matchedRuns: EditRun[] } {
  const allRuns = groupIntoRuns({ events: pipeline.events, binMs });
  return { allRuns, matchedRuns: filterRuns({ runs: allRuns, term: filter.term, authorKeys: matchingAuthorKeys({ services, pipeline, author: filter.author }) }) };
}

export function buildDocumentTimeline({ services, documentId, filter, binMs }: { services: AppServices; documentId: string; filter: TimelineFilter; binMs: number | null }): DocumentTimeline {
  const pipeline = readTimelinePipeline({ services, documentId });
  const chosenBinMs = binMsOf({ binMs, pipeline });
  const { allRuns, matchedRuns } = matchedRunsOf({ services, pipeline, filter, binMs: chosenBinMs });
  const marks = services.readModel.marks(documentId);
  const binStarts = pipeline.events.length === 0 ? [] : binStartsCovering({ firstTime: firstTimeOf(pipeline.events), lastTime: lastTimeOf(pipeline.events), binMs: chosenBinMs });
  return {
    binMs: chosenBinMs,
    bins: buildBins({ runs: matchedRuns, binStarts, binMs: chosenBinMs, versionSequenceAt: (time) => versionSequenceAt({ marks, time }) }),
    bands: buildBands({ identities: pipeline.identities, allRuns, matchedRuns }),
    contributorsByBand: contributorsByBand(matchedRuns),
    authors: pipeline.authors,
    topics: topicStatusOf({ services, documentId }),
    projection: projectionStatus({ services, documentId }),
  };
}

export function buildBinEdits({ services, documentId, filter, binStart, binMs }: { services: AppServices; documentId: string; filter: TimelineFilter; binStart: number; binMs: number | null }): BinEdits {
  const pipeline = readTimelinePipeline({ services, documentId });
  const chosenBinMs = binMsOf({ binMs, pipeline });
  const { matchedRuns } = matchedRunsOf({ services, pipeline, filter, binMs: chosenBinMs });
  const runs = matchedRuns.filter((run) => run.binStart === binStart).map(({ blockId, bandId, authorKeys, inserted, deleted, lastServerTime }) => ({ blockId, bandId, authorKeys, inserted, deleted, lastServerTime }));
  const authorKeys = new Set(runs.flatMap((run) => run.authorKeys));
  const authors = Object.fromEntries(Object.entries(pipeline.authors).filter(([key]) => authorKeys.has(key)));
  return { binStart, binMs: chosenBinMs, runs, authors };
}
