import type { RoomMode } from '@superdoc-collab/types';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { DocumentNotReadyError, documentFileQueryKey, openedDocumentQueryKey } from './editor-api';

type DocumentReload = {
  editorGeneration: number;
  isReloading: boolean;
  hasReloadFailed: boolean;
  reload: () => Promise<void>;
};

export function useDocumentReload({
  documentId,
  roomMode,
  restartWaiting,
  resetConnection,
}: {
  documentId: string;
  roomMode: RoomMode | undefined;
  restartWaiting: () => void;
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
    } catch (error) {
      if (!(error instanceof DocumentNotReadyError)) return setHasReloadFailed(true);
      restartWaiting();
    } finally {
      setIsReloading(false);
    }
    resetConnection();
    setEditorGeneration((generation) => generation + 1);
  }

  return { editorGeneration, isReloading, hasReloadFailed, reload };
}
