import { MINUTE_MS } from '@superdoc-history/types';
import { expect, test, vi } from 'vitest';
import { twoAuthorsInTwoBlocks } from '../testing/timeline-client';
import { buildSelectionSnapshot } from './timeline-service';

const CURSOR_ADVANCE = 5;

test('a selection snapshot is stamped with the cursor its events were read at', async () => {
  const { server, documentId } = await twoAuthorsInTwoBlocks();
  const { readModel } = server.services;
  const builtAt = readModel.cursor(documentId)!;
  vi.spyOn(readModel, 'cursor')
    .mockReturnValueOnce(builtAt)
    .mockReturnValueOnce(builtAt)
    .mockReturnValue(builtAt + CURSOR_ADVANCE);
  const snapshot = buildSelectionSnapshot({
    services: server.services,
    documentId,
    selection: { term: null, author: null, topic: null, at: null, binMs: MINUTE_MS },
  });
  expect(snapshot.cursor).toBe(builtAt);
  vi.restoreAllMocks();
  await server.stop();
});
