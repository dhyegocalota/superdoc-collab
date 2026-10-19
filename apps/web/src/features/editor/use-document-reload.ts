import type { RoomMode } from '@superdoc-collab/types';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { documentFileQueryKey, openedDocumentQueryKey } from './editor-api';

type DocumentReload = {
  editorGeneration: number;
  isReloading: boolean;
  hasReloadFailed: boolean;
  reload: () => Promise<void>;
};

export function useDocumentReload({
  documentId,
  roomMode,
  resetConnection,
}: {
  documentId: string;
  roomMode: RoomMode | undefined;
  resetConnection: () => void;
}): DocumentReload {
  const queryClient = useQueryClient();
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [hasReloadFailed, setHasReloadFailed] = useState(false);

  async function reload(): Promise<void> {
    setIsReloading(true);
    setHasReloadFailed(false);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: openedDocumentQueryKey(documentId), exact: true }, { throwOnError: true }),
        queryClient.refetchQueries({ queryKey: documentFileQueryKey({ documentId, roomMode }), exact: true }, { throwOnError: true }),
      ]);
    } catch {
      return setHasReloadFailed(true);
    } finally {
      setIsReloading(false);
    }
    resetConnection();
    setEditorGeneration((generation) => generation + 1);
  }

  return { editorGeneration, isReloading, hasReloadFailed, reload };
}
