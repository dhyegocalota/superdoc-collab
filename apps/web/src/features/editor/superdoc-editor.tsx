import { ApiPath, COLLABORATION_TOKEN_PLACEHOLDER, DOCX_MIME_TYPE, DocumentRole, type RoomMode, type SessionUser } from '@superdoc-history/types';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { EDITOR_FAILED_MESSAGE } from './editor-copy';

const HOCUSPOCUS_PROVIDER = 'hocuspocus';
const HTTP_SCHEME = /^http/;

export enum DocumentMode {
  Viewing = 'viewing',
  Editing = 'editing',
}

type SuperDocEditorProps = { superdocRef: RefObject<SuperDoc | null>; documentId: string; roomMode: RoomMode; role: DocumentRole; user: SessionUser; file: Blob };

function collaborationUrl(): string {
  return `${window.location.origin.replace(HTTP_SCHEME, 'ws')}${ApiPath.Collaboration}`;
}

export function SuperDocEditor({ superdocRef, documentId, roomMode, role, user, file }: SuperDocEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const superdoc = new SuperDoc({
      selector: container,
      documentMode: role === DocumentRole.Reader ? DocumentMode.Viewing : DocumentMode.Editing,
      documents: [
        {
          id: documentId,
          type: DOCX_MIME_TYPE,
          data: file,
          v2Collaboration: { providerType: HOCUSPOCUS_PROVIDER, documentId, serverUrl: collaborationUrl(), roomMode, token: COLLABORATION_TOKEN_PLACEHOLDER },
        },
      ],
      user: { id: user.id, name: user.name, email: user.email },
      onException: () => setHasFailed(true),
    });
    superdocRef.current = superdoc;
    return () => {
      superdocRef.current = null;
      superdoc.destroy();
    };
  }, [superdocRef, documentId, roomMode, role, user, file]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {hasFailed && <p role="alert" className="p-4 text-sm text-destructive">{EDITOR_FAILED_MESSAGE}</p>}
      <div ref={containerRef} data-testid="document-editor" className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto" />
    </div>
  );
}
