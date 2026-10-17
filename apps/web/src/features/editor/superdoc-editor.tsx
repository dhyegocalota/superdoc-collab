import { ApiPath, DocumentRole, type RoomMode, type SessionUser } from '@superdoc-history/types';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { KeyboardKey } from '@/lib/keyboard';
import { DocumentMode, superdocOptions } from './superdoc-options';
import { EDITOR_ESCAPE_HINT, EDITOR_EXIT_LABEL, EDITOR_FAILED_MESSAGE } from './editor-copy';
import { cn } from '@/lib/utils';
import { FITTED_PAGE_CLASS, followViewportZoom } from './superdoc-zoom';

const EDITING_SURFACE_SELECTOR = 'textarea, [contenteditable="true"], [role="document"]';

type SuperDocEditorProps = {
  superdocRef: RefObject<SuperDoc | null>;
  documentId: string;
  roomMode: RoomMode;
  role: DocumentRole;
  user: SessionUser;
  file: Blob;
  isInert: boolean;
};

export function SuperDocEditor({ superdocRef, documentId, roomMode, role, user, file, isInert }: SuperDocEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<HTMLParagraphElement>(null);
  const [hasFailed, setHasFailed] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const superdoc = new SuperDoc({
      ...superdocOptions({
        container,
        documentId,
        file,
        documentMode: role === DocumentRole.Reader ? DocumentMode.Viewing : DocumentMode.Editing,
        collaborationPath: ApiPath.Collaboration,
        roomMode,
        user,
        viewport: window,
      }),
      onException: () => setHasFailed(true),
    });
    superdocRef.current = superdoc;
    const stopFollowingViewport = followViewportZoom({ superdoc, viewport: window });
    return () => {
      stopFollowingViewport();
      superdocRef.current = null;
      superdoc.destroy();
    };
  }, [superdocRef, documentId, roomMode, role, user, file]);

  function leaveEditingSurface(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== KeyboardKey.Escape || event.defaultPrevented) return;
    const surface = event.target instanceof HTMLElement ? event.target.closest(EDITING_SURFACE_SELECTOR) : null;
    const isOnEditingSurface = surface !== null && event.currentTarget.contains(surface);
    if (!isOnEditingSurface) return;
    exitRef.current?.focus();
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" onKeyDown={leaveEditingSurface}>
      {hasFailed && <ErrorMessage className="p-4">{EDITOR_FAILED_MESSAGE}</ErrorMessage>}
      <p className="sr-only">{EDITOR_ESCAPE_HINT}</p>
      <div
        ref={containerRef}
        data-testid="document-editor"
        inert={isInert}
        className={cn(
          'min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto bg-muted [&_.superdoc-page]:bg-background [&_.superdoc-page]:shadow-sm',
          FITTED_PAGE_CLASS,
        )}
      />
      <p ref={exitRef} tabIndex={-1} className="sr-only focus:not-sr-only focus:px-4 focus:py-1 focus:text-xs focus:text-muted-foreground">
        {EDITOR_EXIT_LABEL}
      </p>
    </div>
  );
}
