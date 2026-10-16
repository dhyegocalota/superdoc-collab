import { ApiPath, COLLABORATION_TOKEN_PLACEHOLDER, DOCX_MIME_TYPE, DocumentRole, type RoomMode, type SessionUser } from '@superdoc-history/types';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { useEffect, useRef } from 'react';

const HOCUSPOCUS_PROVIDER = 'hocuspocus';
const READER_DOCUMENT_MODE = 'viewing';
const EDITOR_DOCUMENT_MODE = 'editing';
const HTTP_SCHEME = /^http/;

type SuperDocEditorProps = { documentId: string; roomMode: RoomMode; role: DocumentRole; user: SessionUser; file: Blob };

function collaborationUrl(): string {
  return `${window.location.origin.replace(HTTP_SCHEME, 'ws')}${ApiPath.Collaboration}`;
}

export function SuperDocEditor({ documentId, roomMode, role, user, file }: SuperDocEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const superdoc = new SuperDoc({
      selector: container,
      documentMode: role === DocumentRole.Reader ? READER_DOCUMENT_MODE : EDITOR_DOCUMENT_MODE,
      documents: [
        {
          id: documentId,
          type: DOCX_MIME_TYPE,
          data: file,
          v2Collaboration: { providerType: HOCUSPOCUS_PROVIDER, documentId, serverUrl: collaborationUrl(), roomMode, token: COLLABORATION_TOKEN_PLACEHOLDER },
        },
      ],
      user: { id: user.id, name: user.name, email: user.email },
    });
    return () => superdoc.destroy();
  }, [documentId, roomMode, role, user, file]);

  return <div ref={containerRef} data-testid="document-editor" className="min-h-0 flex-1 overflow-auto" />;
}
