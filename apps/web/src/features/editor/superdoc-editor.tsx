import { ApiPath, type AuthorColorSlot, ConnectionFailureReason, DocumentRole, type RoomMode } from '@superdoc-collab/types';
import { SuperDoc, type SuperDocExceptionPayload } from 'superdoc';
import 'superdoc/style.css';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import type { EditorLoadProgress } from '@/features/open-progress/open-progress-view';
import { KeyboardKey } from '@/lib/keyboard';
import { authorPaletteOf } from './author-palette';
import { ExceptionOutcome, exceptionOutcome, failureReasonOf } from './superdoc-exceptions';
import { type CollaborationUser, DocumentMode, superdocOptions } from './superdoc-options';
import { EDIT_REJECTED_MESSAGE, EDITOR_ESCAPE_HINT, EDITOR_EXIT_LABEL, EDITOR_FAILED_MESSAGE } from './editor-copy';
import { cn } from '@/lib/utils';
import { FITTED_PAGE_CLASS } from './superdoc-zoom';
import { useCaretOnOpen } from './use-caret-on-open';
import { TransportReading, transportReportOf, type TransportReport } from './use-connection-state';

const EDITING_SURFACE_SELECTOR = 'textarea, [contenteditable="true"], [role="document"]';

export const HIDDEN_LOADING_OVERLAY_CLASS = '[&_.v2-document-loading-overlay]:hidden';
export const DOCUMENT_SURFACE_CLASS =
  'min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto bg-muted pt-3 [&_.superdoc-page]:bg-paper [&_.superdoc-page]:shadow-sm';

type SuperDocEditorProps = {
  onSuperdocChange: (superdoc: SuperDoc | null) => void;
  onContainerChange: (container: HTMLElement | null) => void;
  toolbarContainer: HTMLElement | null;
  documentId: string;
  roomMode: RoomMode;
  role: DocumentRole;
  user: CollaborationUser;
  colorSlot: AuthorColorSlot;
  file: Blob;
  isInert: boolean;
  collaborationPath?: string;
  collaborationToken?: string;
  onTransportReport: (report: TransportReport) => void;
  onEditorUpdate: () => void;
  onDocumentEdit: () => void;
  onLoadProgress: (progress: EditorLoadProgress) => void;
};

export function SuperDocEditor({
  onSuperdocChange,
  onContainerChange,
  toolbarContainer,
  documentId,
  roomMode,
  role,
  user,
  colorSlot,
  file,
  isInert,
  collaborationPath = ApiPath.Collaboration,
  collaborationToken,
  onTransportReport,
  onEditorUpdate,
  onDocumentEdit,
  onLoadProgress,
}: SuperDocEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const exitRef = useRef<HTMLParagraphElement>(null);
  const [hasFailed, setHasFailed] = useState(false);
  const [hasRejectedEdit, setHasRejectedEdit] = useState(false);
  const [isCollaborationReady, setIsCollaborationReady] = useState(false);
  const [pageCount, setPageCount] = useState(0);
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
      if (report.reading !== TransportReading.Failed) return;
      setHasFailed(true);
      const isDenied = report.failureReason === ConnectionFailureReason.AccessDenied;
      if (isDenied) onTransportReport(report);
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
        collaborationPath,
        collaborationToken,
        roomMode,
        user,
        ...authorPaletteOf({ colorSlot }),
      }),
      onReady: ({ superdoc: readySuperdoc }) => onSuperdocChange(readySuperdoc),
      onEditorUpdate: reportDocumentEdit,
      onPaginationUpdate: ({ totalPages }) => {
        reportEditorUpdate();
        if (isActive) setPageCount(totalPages);
      },
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
      setPageCount(0);
      setHasRejectedEdit(false);
    };
  }, [
    onSuperdocChange,
    toolbarContainer,
    documentId,
    roomMode,
    role,
    user,
    file,
    collaborationPath,
    collaborationToken,
    onTransportReport,
    onEditorUpdate,
    onDocumentEdit,
  ]);

  useEffect(
    () => onLoadProgress({ isSynced: isCollaborationReady, pageCount, hasFailed }),
    [onLoadProgress, isCollaborationReady, pageCount, hasFailed],
  );

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
      {hasFailed && <ErrorMessage className="p-4">{EDITOR_FAILED_MESSAGE}</ErrorMessage>}
      {hasRejectedEdit && (
        <p role="status" className="px-4 py-1 text-xs text-muted-foreground">
          {EDIT_REJECTED_MESSAGE}
        </p>
      )}
      <p className="sr-only">{EDITOR_ESCAPE_HINT}</p>
      <div ref={attachContainer} data-testid="document-editor" inert={isInert} className={cn(DOCUMENT_SURFACE_CLASS, FITTED_PAGE_CLASS)} />
      <p ref={exitRef} tabIndex={-1} className="sr-only focus:not-sr-only focus:px-4 focus:py-1 focus:text-xs focus:text-muted-foreground">
        {EDITOR_EXIT_LABEL}
      </p>
    </div>
  );
}
