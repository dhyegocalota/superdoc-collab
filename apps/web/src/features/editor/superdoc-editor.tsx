import { ApiPath, AUTHOR_COLOR_SLOT_COUNT, authorColorSlot, DocumentRole, type RoomMode, type SessionUser } from '@superdoc-collab/types';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { KeyboardKey } from '@/lib/keyboard';
import { isRecoverableException } from './superdoc-exceptions';
import { DocumentMode, superdocOptions } from './superdoc-options';
import { EDIT_REJECTED_MESSAGE, EDITOR_ESCAPE_HINT, EDITOR_EXIT_LABEL, EDITOR_FAILED_MESSAGE } from './editor-copy';
import { cn } from '@/lib/utils';
import { FITTED_PAGE_CLASS } from './superdoc-zoom';

const EDITING_SURFACE_SELECTOR = 'textarea, [contenteditable="true"], [role="document"]';

class MissingAuthorColorError extends Error {}

function authorColorOf(slot: number): string {
  const color = getComputedStyle(document.documentElement).getPropertyValue(`--author-${slot}`).trim();
  if (color === '') throw new MissingAuthorColorError(`--author-${slot}`);
  return color;
}

type SuperDocEditorProps = {
  onSuperdocChange: (superdoc: SuperDoc | null) => void;
  toolbarContainer: HTMLElement | null;
  documentId: string;
  roomMode: RoomMode;
  role: DocumentRole;
  user: SessionUser;
  file: Blob;
  isInert: boolean;
};

export function SuperDocEditor({
  onSuperdocChange,
  toolbarContainer,
  documentId,
  roomMode,
  role,
  user,
  file,
  isInert,
}: SuperDocEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<HTMLParagraphElement>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [hasRejectedEdit, setHasRejectedEdit] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const superdoc = new SuperDoc({
      ...superdocOptions({
        container,
        toolbarContainer,
        documentId,
        file,
        documentMode: role === DocumentRole.Reader ? DocumentMode.Viewing : DocumentMode.Editing,
        collaborationPath: ApiPath.Collaboration,
        roomMode,
        user,
        userColor: authorColorOf(authorColorSlot(user.id)),
        paletteColors: Array.from({ length: AUTHOR_COLOR_SLOT_COUNT }, (_, index) => authorColorOf(index + 1)),
      }),
      onReady: ({ superdoc: readySuperdoc }) => onSuperdocChange(readySuperdoc),
      onException: (payload) => {
        if (isRecoverableException(payload)) return setHasRejectedEdit(true);
        setHasFailed(true);
      },
    });
    return () => {
      onSuperdocChange(null);
      superdoc.destroy();
      setHasRejectedEdit(false);
    };
  }, [onSuperdocChange, toolbarContainer, documentId, roomMode, role, user, file]);

  function clearRejectedEdit(): void {
    setHasRejectedEdit(false);
  }

  function leaveEditingSurface(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== KeyboardKey.Escape || event.defaultPrevented) return;
    const surface = event.target instanceof HTMLElement ? event.target.closest(EDITING_SURFACE_SELECTOR) : null;
    const isOnEditingSurface = surface !== null && event.currentTarget.contains(surface);
    if (!isOnEditingSurface) return;
    exitRef.current?.focus();
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" onKeyDown={leaveEditingSurface} onClick={clearRejectedEdit}>
      {hasFailed && <ErrorMessage className="p-4">{EDITOR_FAILED_MESSAGE}</ErrorMessage>}
      {hasRejectedEdit && (
        <p role="status" className="px-4 py-1 text-xs text-muted-foreground">
          {EDIT_REJECTED_MESSAGE}
        </p>
      )}
      <p className="sr-only">{EDITOR_ESCAPE_HINT}</p>
      <div
        ref={containerRef}
        data-testid="document-editor"
        inert={isInert}
        className={cn(
          'min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto bg-muted [&_.superdoc-page]:bg-paper [&_.superdoc-page]:shadow-sm',
          FITTED_PAGE_CLASS,
        )}
      />
      <p ref={exitRef} tabIndex={-1} className="sr-only focus:not-sr-only focus:px-4 focus:py-1 focus:text-xs focus:text-muted-foreground">
        {EDITOR_EXIT_LABEL}
      </p>
    </div>
  );
}
