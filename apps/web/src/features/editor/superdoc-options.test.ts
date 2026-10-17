import { COLLABORATION_TOKEN_PLACEHOLDER, DOCX_MIME_TYPE, RoomMode } from '@superdoc-history/types';
import { expect, test } from 'vitest';
import { SESSION_USER } from '@/testing/opened-document';
import { HOCUSPOCUS_PROVIDER } from './collaboration-config';
import { DocumentMode, superdocOptions } from './superdoc-options';
import { SUPERDOC_TELEMETRY } from './superdoc-telemetry';
import { ZoomMode } from './superdoc-zoom';

const DOCUMENT_ID = 'doc-1';
const COLLABORATION_PATH = '/collaboration/doc-1';

test('the options open the file in its room as the signed-in user at the viewport zoom', () => {
  const container = document.createElement('div');
  const file = new Blob();
  const options = superdocOptions({
    container,
    documentId: DOCUMENT_ID,
    file,
    documentMode: DocumentMode.Viewing,
    collaborationPath: COLLABORATION_PATH,
    roomMode: RoomMode.Join,
    user: { ...SESSION_USER },
    viewport: window,
  });
  expect(options).toEqual({
    selector: container,
    documentMode: DocumentMode.Viewing,
    documents: [
      {
        id: DOCUMENT_ID,
        type: DOCX_MIME_TYPE,
        data: file,
        v2Collaboration: {
          providerType: HOCUSPOCUS_PROVIDER,
          documentId: DOCUMENT_ID,
          serverUrl: `ws://localhost:3000${COLLABORATION_PATH}`,
          roomMode: RoomMode.Join,
          token: COLLABORATION_TOKEN_PLACEHOLDER,
        },
      },
    ],
    user: SESSION_USER,
    telemetry: SUPERDOC_TELEMETRY,
    zoom: { mode: ZoomMode.Manual },
  });
});
