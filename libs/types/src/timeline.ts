import type { EventAuthor } from './history';

export const TOPIC_RECOMPUTE_NEW_BLOCKS = 5;
export const EVENTS_PAGE_SIZE = 500;
export const FILTER_MAX_LENGTH = 200;
export const OTHER_BAND_ID = 'other';
export const OTHER_BAND_NAME = 'Other';
export const VERSION_NOT_READY_ERROR = 'VERSION_NOT_READY';
export const TOPICS_UNAVAILABLE_MESSAGE = 'Topics unavailable';
export const TOPICS_PENDING_MESSAGE = 'Naming topics…';
export const TOPICS_FAILED_MESSAGE = 'The topics could not be named. Try again.';
export const TOPICS_REFRESH_TOO_SOON_MESSAGE = 'Topics were refreshed a moment ago. Try again in a few seconds.';
export const HISTORY_CATCHING_UP_MESSAGE = 'History is catching up';
export const NO_MATCHING_EDITS_MESSAGE = 'No edits match';
export const TOPICS_INTERRUPTED_MESSAGE = 'Naming topics was interrupted. Try again.';
export const VERSION_FAILED_ERROR = 'VERSION_FAILED';
export const VERSION_FAILED_MESSAGE = 'This version could not be opened. Try another moment.';

export enum TopicState { Pending = 'pending', Ready = 'ready', Failed = 'failed' }
export enum TimelineFilterKind { Term = 'term', Author = 'author' }
export enum VersionViewerState { Live = 'live', Viewing = 'viewing' }
export enum TimelineBandKind { Topic = 'topic', Other = 'other', Author = 'author' }
export enum TimelineSearchParam { Term = 'term', Author = 'author', At = 'at', Topic = 'topic' }
export enum TimelineQueryParam { Term = 'term', Author = 'author', BinMs = 'binMs', BinStart = 'binStart', AfterSequence = 'afterSequence', Limit = 'limit', Around = 'around' }

export type TimelineFilter = { term: string | null; author: string | null };
export type TimelineCell = { inserted: number; deleted: number; authorKeys: string[] };
export type TimelineBin = { start: number; versionSequence: number | null; byBand: Record<string, TimelineCell> };
export type TimelineBand = { id: string; kind: TimelineBandKind; name: string; hue: number | null; onsetTime: number; volume: number };
export type TimelineContributor = { authorKey: string; inserted: number; deleted: number; wordsInserted: number; wordsDeleted: number };
export type TopicStatus = { state: TopicState; failure: string | null; computedAtSequence: number | null };
export type ProjectionStatus = { isBehind: boolean; lagMs: number | null; isDegraded: boolean };
export type DocumentTimeline = { binMs: number; bins: TimelineBin[]; bands: TimelineBand[]; contributorsByBand: Record<string, TimelineContributor[]>; authors: Record<string, EventAuthor>; topics: TopicStatus; projection: ProjectionStatus };
export type DocumentTopic = { id: string; name: string; blockCount: number };
export type DocumentTopics = { status: TopicStatus; topics: DocumentTopic[] };
export type TopicSummary = { topicId: string; sentence: string; computedAtSequence: number };
export type TopicSummaries = { summaries: TopicSummary[] };
export type EditRunView = { blockId: string; bandId: string; authorKeys: string[]; inserted: string; deleted: string; lastServerTime: number };
export type BinEdits = { binStart: number; binMs: number; runs: EditRunView[]; authors: Record<string, EventAuthor> };
export type VersionSummary = { sequence: number; serverTime: number; collaborationPath: string };
export type VersionText = { sequence: number; text: string };
export type VersionMarks = { marks: { sequence: number; serverTime: number }[] };
