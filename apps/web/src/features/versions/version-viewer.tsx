import {
  COLLABORATION_TOKEN_PLACEHOLDER,
  DOCX_MIME_TYPE,
  RoomMode,
  versionCollaborationPath,
  type SessionUser,
} from '@superdoc-history/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { collaborationUrl, HOCUSPOCUS_PROVIDER } from '@/features/editor/collaboration-config';
import { documentFileQueryKey, fetchDocumentFile } from '@/features/editor/editor-api';
import { DocumentMode } from '@/features/editor/superdoc-editor';
import { followViewportZoom, initialZoomMode } from '@/features/editor/superdoc-zoom';

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
      selector: container,
      documentMode: DocumentMode.Viewing,
      documents: [
        {
          id: documentId,
          type: DOCX_MIME_TYPE,
          data: blank,
          v2Collaboration: {
            providerType: HOCUSPOCUS_PROVIDER,
            documentId,
            serverUrl: collaborationUrl(versionCollaborationPath({ documentId, sequence })),
            roomMode: RoomMode.Join,
            token: COLLABORATION_TOKEN_PLACEHOLDER,
          },
        },
      ],
      user: { id: user.id, name: user.name, email: user.email },
      zoom: { mode: initialZoomMode() },
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
    const stopFollowingViewport = followViewportZoom(superdoc);
    return () => {
      stopFollowingViewport();
      superdoc.destroy();
    };
  }, [documentId, sequence, blank, user, onReady, onFailed, onConnectionFailed]);

  return <div ref={containerRef} data-testid="version-viewer" className="h-dvh min-w-0 overflow-auto" />;
}
