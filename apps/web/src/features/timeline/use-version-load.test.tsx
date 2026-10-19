import { HttpStatus, RETRY_AFTER_HEADER, versionApiPath, type VersionSummary } from '@superdoc-collab/types';
import { waitFor } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { jsonResponse } from '@/testing/json-response';
import { renderHookWithRouter } from '@/testing/render-with-providers';
import { VersionLoadKind } from './timeline-api';
import { useVersionLoad } from './use-version-load';

const DOCUMENT_ID = 'doc-1';
const SEQUENCE = 7;
const RETRY_AFTER_SECONDS = '1';
const WAIT_FOR_RETRY_MS = 5000;
const VERSION: VersionSummary = { sequence: SEQUENCE, serverTime: 1, collaborationPath: '/collaboration/versions/doc-1/7' };

afterEach(() => vi.restoreAllMocks());

test('a throttled load waits for Retry-After and then resolves the version', async () => {
  const replies = [
    new Response(null, { status: HttpStatus.TooManyRequests, headers: { [RETRY_AFTER_HEADER]: RETRY_AFTER_SECONDS } }),
    jsonResponse({ body: VERSION }),
  ];
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => replies.shift()!);
  const { result } = renderHookWithRouter(() => useVersionLoad({ documentId: DOCUMENT_ID, sequence: SEQUENCE }));
  await waitFor(() => expect(result.current.version).toEqual({ kind: VersionLoadKind.Ready, version: VERSION }), {
    timeout: WAIT_FOR_RETRY_MS,
  });
  expect(fetchSpy.mock.calls.map(([input]) => String(input))).toEqual([
    versionApiPath({ documentId: DOCUMENT_ID, sequence: SEQUENCE }),
    versionApiPath({ documentId: DOCUMENT_ID, sequence: SEQUENCE }),
  ]);
  expect(result.current.isError).toBe(false);
});
