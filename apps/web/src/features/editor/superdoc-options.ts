import { COLLABORATION_TOKEN_PLACEHOLDER, DOCX_MIME_TYPE, type RoomMode, type SessionUser } from '@superdoc-collab/types';
import type { Config } from 'superdoc';
import { collaborationUrl, HOCUSPOCUS_PROVIDER } from './collaboration-config';
import { SUPERDOC_TELEMETRY } from './superdoc-telemetry';
import { initialZoomMode } from './superdoc-zoom';

export enum DocumentMode {
  Viewing = 'viewing',
  Editing = 'editing',
}

export function superdocOptions({
  container,
  documentId,
  file,
  documentMode,
  collaborationPath,
  roomMode,
  user,
  viewport,
}: {
  container: HTMLElement;
  documentId: string;
  file: Blob;
  documentMode: DocumentMode;
  collaborationPath: string;
  roomMode: RoomMode;
  user: SessionUser;
  viewport: Window;
}): Config {
  return {
    selector: container,
    documentMode,
    documents: [
      {
        id: documentId,
        type: DOCX_MIME_TYPE,
        data: file,
        v2Collaboration: {
          providerType: HOCUSPOCUS_PROVIDER,
          documentId,
          serverUrl: collaborationUrl(collaborationPath),
          roomMode,
          token: COLLABORATION_TOKEN_PLACEHOLDER,
        },
      },
    ],
    user: { id: user.id, name: user.name, email: user.email },
    telemetry: SUPERDOC_TELEMETRY,
    zoom: { mode: initialZoomMode(viewport) },
  };
}
