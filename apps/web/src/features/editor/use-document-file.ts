import type { RoomMode } from '@superdoc-history/types';
import { skipToken, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { documentFileQueryKey, fetchDocumentFile } from './editor-api';

export function useDocumentFile({ documentId, roomMode }: { documentId: string; roomMode: RoomMode | undefined }): UseQueryResult<Blob> {
  return useQuery({
    queryKey: documentFileQueryKey({ documentId, roomMode }),
    queryFn: roomMode === undefined ? skipToken : () => fetchDocumentFile({ documentId, roomMode }),
    staleTime: Infinity,
  });
}
