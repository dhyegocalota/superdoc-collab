import { DocumentRole } from '@superdoc-collab/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { expect, test, vi } from 'vitest';
import { DOCUMENT_ID, openedAs } from '@/testing/opened-document';
import { openedDocumentQueryKey } from './editor-api';
import { useOpenedDocument } from './use-opened-document';

vi.mock('./editor-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./editor-api')>()),
  openDocument: async () => openedAs(DocumentRole.Editor),
}));

test('the open answer never goes stale, so a focus refetch cannot re-reserve the creator', async () => {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useOpenedDocument(DOCUMENT_ID), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(
    queryClient
      .getQueryCache()
      .find({ queryKey: openedDocumentQueryKey(DOCUMENT_ID) })
      ?.isStale(),
  ).toBe(false);
});
