import {
  COLLABORATION_TOKEN_PLACEHOLDER,
  type CreatorTicket,
  DOCX_MIME_TYPE,
  type RoomMode,
  type SessionUser,
} from '@superdoc-collab/types';
import type { CommentsLayout, Config } from 'superdoc';
import { collaborationUrl, HOCUSPOCUS_PROVIDER } from './collaboration-config';
import { SUPERDOC_TELEMETRY } from './superdoc-telemetry';
import { initialZoomMode } from './superdoc-zoom';

const COMMENTS_LAYOUT_BY_WIDTH: CommentsLayout = 'auto';
const COMMENTS_INLINE_BELOW_PX = 480;

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
  creatorTicket,
  user,
  viewport,
}: {
  container: HTMLElement;
  documentId: string;
  file: Blob;
  documentMode: DocumentMode;
  collaborationPath: string;
  roomMode: RoomMode;
  creatorTicket: CreatorTicket | null;
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
          serverUrl: collaborationUrl({ path: collaborationPath, creatorTicket }),
          roomMode,
          token: COLLABORATION_TOKEN_PLACEHOLDER,
        },
      },
    ],
    user: { id: user.id, name: user.name, email: user.email },
    telemetry: SUPERDOC_TELEMETRY,
    zoom: { mode: initialZoomMode(viewport) },
    ui: { comments: { layout: COMMENTS_LAYOUT_BY_WIDTH, responsive: { breakpoint: COMMENTS_INLINE_BELOW_PX } } },
  };
}
