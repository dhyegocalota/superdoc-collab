import { ApiPath, COLLABORATION_TOKEN_PLACEHOLDER, DOCX_MIME_TYPE, DocumentRole, type RoomMode, type SessionUser } from '@superdoc-history/types';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { KeyboardKey } from '@/lib/keyboard';
import { collaborationUrl, HOCUSPOCUS_PROVIDER } from './collaboration-config';
import { EDITOR_ESCAPE_HINT, EDITOR_EXIT_LABEL, EDITOR_FAILED_MESSAGE } from './editor-copy';

const EDITING_SURFACE_SELECTOR = 'textarea, [contenteditable="true"]';

export enum DocumentMode {
  Viewing = 'viewing',
  Editing = 'editing',
}

type SuperDocEditorProps = { superdocRef: RefObject<SuperDoc | null>; documentId: string; roomMode: RoomMode; role: DocumentRole; user: SessionUser; file: Blob; isInert: boolean };

export function SuperDocEditor({ superdocRef, documentId, roomMode, role, user, file, isInert }: SuperDocEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<HTMLParagraphElement>(null);
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
          v2Collaboration: { providerType: HOCUSPOCUS_PROVIDER, documentId, serverUrl: collaborationUrl(ApiPath.Collaboration), roomMode, token: COLLABORATION_TOKEN_PLACEHOLDER },
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

  function leaveEditingSurface(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== KeyboardKey.Escape || event.defaultPrevented) return;
    const isOnEditingSurface = event.target instanceof HTMLElement && event.target.closest(EDITING_SURFACE_SELECTOR) !== null;
    if (!isOnEditingSurface) return;
    exitRef.current?.focus();
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" onKeyDown={leaveEditingSurface}>
      {hasFailed && <p role="alert" className="p-4 text-sm text-destructive">{EDITOR_FAILED_MESSAGE}</p>}
      <p className="sr-only">{EDITOR_ESCAPE_HINT}</p>
      <div ref={containerRef} data-testid="document-editor" inert={isInert} className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto" />
      <p ref={exitRef} tabIndex={-1} className="sr-only focus:not-sr-only focus:px-4 focus:py-1 focus:text-xs focus:text-muted-foreground">{EDITOR_EXIT_LABEL}</p>
    </div>
  );
}
