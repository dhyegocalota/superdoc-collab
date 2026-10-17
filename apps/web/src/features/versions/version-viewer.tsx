import { RoomMode, versionCollaborationPath, type SessionUser } from '@superdoc-collab/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { authorPaletteOf } from '@/features/editor/author-palette';
import { documentFileQueryKey, fetchDocumentFile } from '@/features/editor/editor-api';
import { DocumentMode, superdocOptions } from '@/features/editor/superdoc-options';
import { FITTED_PAGE_CLASS } from '@/features/editor/superdoc-zoom';
import { cn } from '@/lib/utils';

enum ConnectionState {
  Degraded = 'degraded',
  Failed = 'failed',
}

type VersionViewerProps = {
  documentId: string;
  sequence: number;
  user: SessionUser;
  onReady: (superdoc: SuperDoc) => void;
  onFailed: () => void;
  onConnectionFailed: () => void;
};

export function VersionViewer({ documentId, sequence, user, onReady, onFailed, onConnectionFailed }: VersionViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { data: blank } = useQuery({
    queryKey: documentFileQueryKey({ documentId, roomMode: RoomMode.Join }),
    queryFn: () => fetchDocumentFile({ documentId, roomMode: RoomMode.Join }),
    staleTime: Infinity,
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !blank) return;
    let isReady = false;
    const superdoc = new SuperDoc({
      ...superdocOptions({
        container,
        toolbarContainer: null,
        documentId,
        file: blank,
        documentMode: DocumentMode.Viewing,
        collaborationPath: versionCollaborationPath({ documentId, sequence }),
        roomMode: RoomMode.Join,
        user,
        ...authorPaletteOf(user),
      }),
      onCollaborationReady: () => {
        isReady = true;
        onReady(superdoc);
      },
      onCollaborationConnectionChange: ({ state }) => {
        const isRefused = state === ConnectionState.Failed || (state === ConnectionState.Degraded && !isReady);
        if (isRefused) onConnectionFailed();
      },
      onException: onFailed,
    });
    return () => {
      superdoc.destroy();
    };
  }, [documentId, sequence, blank, user, onReady, onFailed, onConnectionFailed]);

  return <div ref={containerRef} data-testid="version-viewer" className={cn('h-dvh min-w-0 overflow-auto', FITTED_PAGE_CLASS)} />;
}
