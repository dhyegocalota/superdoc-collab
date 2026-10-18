import { COLLABORATION_TOKEN_PLACEHOLDER, DOCX_MIME_TYPE, type RoomMode, type SessionUser } from '@superdoc-collab/types';
import type { CommentsLayout, Config, ToolbarItemId } from 'superdoc';
import { collaborationUrl, HOCUSPOCUS_PROVIDER } from './collaboration-config';
import { SUPERDOC_TELEMETRY } from './superdoc-telemetry';
import { FIT_WIDTH_ZOOM } from './superdoc-zoom';

const COMMENTS_LAYOUT_BY_WIDTH: CommentsLayout = 'auto';
const COMMENTS_INLINE_BELOW_PX = 480;
const PRINT_DOCUMENT_ID = 'print';

export const TOOLBAR_EXCLUDED_ITEMS = [
  'track-changes-accept-selection',
  'track-changes-reject-selection',
  'ruler',
  'measurement-unit',
  'document-mode',
  'search',
  'linked-style',
  'copy-format',
  'clear-formatting',
  'ai',
] satisfies readonly ToolbarItemId[];

export enum DocumentMode {
  Viewing = 'viewing',
  Editing = 'editing',
}

export function superdocOptions({
  container,
  toolbarContainer,
  documentId,
  file,
  documentMode,
  collaborationPath,
  roomMode,
  user,
  userColor,
  paletteColors,
}: {
  container: HTMLElement;
  toolbarContainer: HTMLElement | null;
  documentId: string;
  file: Blob;
  documentMode: DocumentMode;
  collaborationPath: string;
  roomMode: RoomMode;
  user: SessionUser;
  userColor: string;
  paletteColors: string[];
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
    user: { id: user.id, name: user.name, email: user.email, color: userColor },
    colors: paletteColors,
    telemetry: SUPERDOC_TELEMETRY,
    zoom: FIT_WIDTH_ZOOM,
    ui: {
      comments: { layout: COMMENTS_LAYOUT_BY_WIDTH, responsive: { breakpoint: COMMENTS_INLINE_BELOW_PX } },
      search: true,
      ...(toolbarContainer && {
        toolbar: { container: toolbarContainer, responsiveTo: 'container', excludeItems: TOOLBAR_EXCLUDED_ITEMS },
      }),
    },
  };
}

export function printSuperdocOptions({ container, file }: { container: HTMLElement; file: Blob }): Config {
  return {
    selector: container,
    documentMode: DocumentMode.Viewing,
    documents: [{ id: PRINT_DOCUMENT_ID, type: DOCX_MIME_TYPE, data: file }],
    telemetry: SUPERDOC_TELEMETRY,
    layoutEngineOptions: { virtualization: { enabled: false } },
  };
}
