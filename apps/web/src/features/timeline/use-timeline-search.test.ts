import { documentPagePath, TimelineFilterKind } from '@superdoc-collab/types';
import { act } from '@testing-library/react';
import { expect, test } from 'vitest';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { parseFilterInput, useTimelineSearch } from './use-timeline-search';

test('reads the filter, the moment and the topic from the URL and ignores a malformed at', () => {
  const { result } = renderHookWithRouter(() => useTimelineSearch(), {
    route: `${documentPagePath(DOCUMENT_ID)}?term=budget&author=ana&at=1792165200000&topic=t1`,
  });
  expect(result.current.search).toEqual({ filter: { term: 'budget', author: 'ana' }, at: 1792165200000, topic: 't1' });
  const malformed = renderHookWithRouter(() => useTimelineSearch(), { route: `${documentPagePath(DOCUMENT_ID)}?at=4x2&term=` });
  expect(malformed.result.current.search).toEqual({ filter: { term: null, author: null }, at: null, topic: null });
});

test('an @ prefix filters by person and anything else by text', () => {
  expect(parseFilterInput('@ Ana ')).toEqual({ kind: TimelineFilterKind.Author, value: 'Ana' });
  expect(parseFilterInput('a.b*(')).toEqual({ kind: TimelineFilterKind.Term, value: 'a.b*(' });
  expect([parseFilterInput('   '), parseFilterInput('@')]).toEqual([null, null]);
});

test('update sets present values, removes null ones and keeps the rest of the URL', () => {
  const { result, router } = renderHookWithRouter(() => useTimelineSearch(), {
    route: `${documentPagePath(DOCUMENT_ID)}?term=budget&topic=t1&other=1`,
  });
  act(() => result.current.update({ changes: { term: null, author: 'ana', at: '1792165200000' }, replace: true }));
  expect(router.state.location.search).toBe('?topic=t1&other=1&author=ana&at=1792165200000');
  expect(result.current.search).toEqual({ filter: { term: null, author: 'ana' }, at: 1792165200000, topic: 't1' });
});
