import { DocumentResource, RoomMode, type EditSelection, type TimelineFilter } from '@superdoc-collab/types';
import { QueryClient } from '@tanstack/react-query';
import { expect, test } from 'vitest';
import { documentFileQueryKey, membersQueryKey, openedDocumentQueryKey, shareLinksQueryKey } from '@/features/editor/editor-api';
import {
  binEditsQueryKey,
  selectionSummaryQueryKey,
  summariesQueryKey,
  timelineQueryKey,
  versionQueryKey,
} from '@/features/timeline/timeline-api';
import { documentQueryKey, DOCUMENTS_QUERY_KEY } from './documents-api';

const DOCUMENT_ID = 'doc-1';
const FILTER: TimelineFilter = { term: 'budget', author: null };
const SELECTION: EditSelection = { term: null, author: null, topic: 'band-0', at: null };
const BIN_START = 1_792_165_200_000;
const BIN_MS = 60_000;
const SEQUENCE = 7;
const TIME_ZONE = 'America/Sao_Paulo';

function keysMatching({ queryClient, queryKey }: { queryClient: QueryClient; queryKey: unknown[] }): unknown[][] {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey })
    .map((query) => [...query.queryKey]);
}

test('every document key keeps its value', () => {
  expect(openedDocumentQueryKey(DOCUMENT_ID)).toEqual(['documents', DOCUMENT_ID]);
  expect(membersQueryKey(DOCUMENT_ID)).toEqual(['documents', DOCUMENT_ID, DocumentResource.Members]);
  expect(shareLinksQueryKey(DOCUMENT_ID)).toEqual(['documents', DOCUMENT_ID, DocumentResource.ShareLinks]);
  expect(documentFileQueryKey({ documentId: DOCUMENT_ID, roomMode: RoomMode.Join })).toEqual(['document-file', DOCUMENT_ID, RoomMode.Join]);
  expect(timelineQueryKey({ documentId: DOCUMENT_ID, filter: FILTER, timeZone: TIME_ZONE })).toEqual([
    'documents',
    DOCUMENT_ID,
    DocumentResource.Timeline,
    FILTER,
    TIME_ZONE,
  ]);
  expect(summariesQueryKey(DOCUMENT_ID)).toEqual(['documents', DOCUMENT_ID, DocumentResource.Summaries]);
  expect(binEditsQueryKey({ documentId: DOCUMENT_ID, binStart: BIN_START, binMs: BIN_MS, filter: FILTER, timeZone: TIME_ZONE })).toEqual([
    'documents',
    DOCUMENT_ID,
    DocumentResource.Timeline,
    'edits',
    BIN_START,
    BIN_MS,
    FILTER,
    TIME_ZONE,
  ]);
  expect(versionQueryKey({ documentId: DOCUMENT_ID, sequence: SEQUENCE })).toEqual([
    'documents',
    DOCUMENT_ID,
    DocumentResource.Versions,
    SEQUENCE,
  ]);
  expect(selectionSummaryQueryKey({ documentId: DOCUMENT_ID, selection: SELECTION, timeZone: TIME_ZONE })).toEqual([
    'documents',
    DOCUMENT_ID,
    DocumentResource.Summaries,
    'selection',
    SELECTION,
    TIME_ZONE,
  ]);
});

test('the timeline prefix reaches the timeline and its bin edits, and the documents prefix never reaches the file', () => {
  const queryClient = new QueryClient();
  const timelineKey = timelineQueryKey({ documentId: DOCUMENT_ID, filter: FILTER, timeZone: TIME_ZONE });
  const binEditsKey = binEditsQueryKey({
    documentId: DOCUMENT_ID,
    binStart: BIN_START,
    binMs: BIN_MS,
    filter: FILTER,
    timeZone: TIME_ZONE,
  });
  const fileKey = documentFileQueryKey({ documentId: DOCUMENT_ID, roomMode: RoomMode.Create });
  [timelineKey, binEditsKey, summariesQueryKey(DOCUMENT_ID), membersQueryKey(DOCUMENT_ID), fileKey].forEach((queryKey) =>
    queryClient.setQueryData(queryKey, {}),
  );
  const timelinePrefix = [...DOCUMENTS_QUERY_KEY, DOCUMENT_ID, DocumentResource.Timeline];
  expect(keysMatching({ queryClient, queryKey: timelinePrefix })).toEqual([timelineKey, binEditsKey]);
  expect(keysMatching({ queryClient, queryKey: DOCUMENTS_QUERY_KEY })).not.toContainEqual(fileKey);
});

test('a document key nests its segments under the documents key', () => {
  const membersKey = documentQueryKey({ documentId: DOCUMENT_ID, segments: [DocumentResource.Members] });
  expect(membersKey).toEqual([...DOCUMENTS_QUERY_KEY, DOCUMENT_ID, DocumentResource.Members]);
  expect(documentQueryKey({ documentId: DOCUMENT_ID, segments: [] })).toEqual([...DOCUMENTS_QUERY_KEY, DOCUMENT_ID]);
});
