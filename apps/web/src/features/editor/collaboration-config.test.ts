import { TAB_QUERY_KEY } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { tabId } from '@/lib/tab-id';
import { collaborationUrl } from './collaboration-config';

const COLLABORATION_PATH = '/collaboration';

test('the collaboration URL carries the tab id as the tab query', () => {
  const url = new URL(collaborationUrl(COLLABORATION_PATH));
  expect(url.pathname).toBe(COLLABORATION_PATH);
  expect(url.searchParams.get(TAB_QUERY_KEY)).toBe(tabId());
});
