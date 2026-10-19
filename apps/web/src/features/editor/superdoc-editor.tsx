import { ApiPath, type AuthorColorSlot, type CreatorTicket, DocumentRole, type RoomMode, type SessionUser } from '@superdoc-collab/types';
import { SuperDoc, type SuperDocExceptionPayload } from 'superdoc';
import 'superdoc/style.css';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { KeyboardKey } from '@/lib/keyboard';
import { authorPaletteOf } from './author-palette';
import { ExceptionOutcome, exceptionOutcome, failureReasonOf } from './superdoc-exceptions';
import { DocumentMode, superdocOptions } from './superdoc-options';
import { EDIT_REJECTED_MESSAGE, EDITOR_ESCAPE_HINT, EDITOR_EXIT_LABEL, EDITOR_FAILED_MESSAGE } from './editor-copy';
import { cn } from '@/lib/utils';
import { FITTED_PAGE_CLASS } from './superdoc-zoom';
import { useCaretOnOpen } from './use-caret-on-open';
import { TransportReading, transportReportOf, type TransportReport } from './use-connection-state';

export const HIDDEN_LOADING_OVERLAY_CLASS = '[&_.v2-document-loading-overlay]:hidden';
const EDITING_SURFACE_SELECTOR = 'textarea, [contenteditable="true"], [role="document"]';

type SuperDocEditorProps = {
  onSuperdocChange: (superdoc: SuperDoc | null) => void;
  onContainerChange: (container: HTMLElement | null) => void;
  toolbarContainer: HTMLElement | null;
  documentId: string;
  roomMode: RoomMode;
  creatorTicket: CreatorTicket | null;
  role: DocumentRole;
  user: SessionUser;
  colorSlot: AuthorColorSlot;
  file: Blob;
  isInert: boolean;
  isSuperseded: boolean;
  onTransportReport: (report: TransportReport) => void;
  onEditorUpdate: () => void;
  onDocumentEdit: () => void;
};

export function SuperDocEditor({
  onSuperdocChange,
  onContainerChange,
  toolbarContainer,
  documentId,
  roomMode,
  creatorTicket,
  role,
  user,
  colorSlot,
  file,
  isInert,
  isSuperseded,
  onTransportReport,
  onEditorUpdate,
  onDocumentEdit,
}: SuperDocEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<HTMLParagraphElement>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [hasRejectedEdit, setHasRejectedEdit] = useState(false);
  const [isCollaborationReady, setIsCollaborationReady] = useState(false);
  const attachContainer = useCallback(
    (element: HTMLDivElement | null) => {
      containerRef.current = element;
      onContainerChange(element);
    },
    [onContainerChange],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let isActive = true;
    let isReady = false;
    function reportTransport(report: TransportReport): void {
      isReady = isReady || report.hasSynced;
      if (isReady) return onTransportReport(report);
      if (report.reading === TransportReading.Failed) setHasFailed(true);
    }
    const exceptionHandlers: Record<ExceptionOutcome, (payload: SuperDocExceptionPayload) => void> = {
      [ExceptionOutcome.Logged]: (payload) => {
        if (!('message' in payload)) return;
        console.warn(payload.message);
      },
      [ExceptionOutcome.Recoverable]: () => setHasRejectedEdit(true),
      [ExceptionOutcome.ConnectionFailed]: (payload) =>
        reportTransport({ reading: TransportReading.Failed, failureReason: failureReasonOf(payload), hasSynced: false }),
      [ExceptionOutcome.Fatal]: () => setHasFailed(true),
    };
    function reportEditorUpdate(): void {
      if (!isActive) return;
      onEditorUpdate();
    }
    function reportDocumentEdit(): void {
      if (!isActive) return;
      onEditorUpdate();
      onDocumentEdit();
    }
    const superdoc = new SuperDoc({
      ...superdocOptions({
        container,
        toolbarContainer,
        documentId,
        file,
        documentMode: role === DocumentRole.Reader ? DocumentMode.Viewing : DocumentMode.Editing,
        collaborationPath: ApiPath.Collaboration,
        roomMode,
        creatorTicket,
        user,
        ...authorPaletteOf({ colorSlot }),
      }),
      onReady: ({ superdoc: readySuperdoc }) => onSuperdocChange(readySuperdoc),
      onEditorUpdate: reportDocumentEdit,
      onPaginationUpdate: reportEditorUpdate,
      onCollaborationReady: () => {
        isReady = true;
        if (!isActive) return;
        setIsCollaborationReady(true);
      },
      onCollaborationConnectionChange: (payload) => {
        if (!isActive) return;
        reportTransport(transportReportOf(payload));
      },
      onException: (payload) => {
        if (!isActive) return;
        exceptionHandlers[exceptionOutcome(payload)](payload);
      },
    });
    return () => {
      isActive = false;
      onSuperdocChange(null);
      superdoc.destroy();
      setIsCollaborationReady(false);
      setHasRejectedEdit(false);
    };
  }, [
    onSuperdocChange,
    toolbarContainer,
    documentId,
    roomMode,
    creatorTicket,
    role,
    user,
    file,
    onTransportReport,
    onEditorUpdate,
    onDocumentEdit,
  ]);

  useCaretOnOpen({ containerRef, isEnabled: isCollaborationReady && role !== DocumentRole.Reader });

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
      {hasFailed && !isSuperseded && <ErrorMessage className="p-4">{EDITOR_FAILED_MESSAGE}</ErrorMessage>}
      {hasRejectedEdit && (
        <p role="status" className="px-4 py-1 text-xs text-muted-foreground">
          {EDIT_REJECTED_MESSAGE}
        </p>
      )}
      <p className="sr-only">{EDITOR_ESCAPE_HINT}</p>
      <div
        ref={attachContainer}
        data-testid="document-editor"
        inert={isInert}
        className={cn(
          'min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto bg-muted [&_.superdoc-page]:bg-paper [&_.superdoc-page]:shadow-sm',
          FITTED_PAGE_CLASS,
          isSuperseded && HIDDEN_LOADING_OVERLAY_CLASS,
        )}
      />
      <p ref={exitRef} tabIndex={-1} className="sr-only focus:not-sr-only focus:px-4 focus:py-1 focus:text-xs focus:text-muted-foreground">
        {EDITOR_EXIT_LABEL}
      </p>
    </div>
  );
}
