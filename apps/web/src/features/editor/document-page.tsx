import { AppRoute, ConnectionFailureReason, ConnectionState, DocumentRole, VersionViewerState } from '@superdoc-collab/types';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { SuperDoc } from 'superdoc';
import { ErrorMessage } from '@/components/error-message';
import { signInPathFor } from '@/features/auth/sign-in-path';
import { SIGNED_OUT_STATE } from '@/features/auth/sign-out-state';
import { useSession } from '@/features/auth/use-session';
import { UseWithAiDialog, type UseWithAiSlot } from '@/features/connected-apps/use-with-ai-dialog';
import { LOADING_VERSION_MESSAGE } from '@/features/timeline/timeline-copy';
import { TimelinePanel } from '@/features/timeline/timeline-panel';
import { isPanelOpenByDefault, PanelPosition, usePanelPosition } from '@/features/timeline/use-panel-position';
import { useSummarize } from '@/features/timeline/use-summarize';
import { useTimeTravel } from '@/features/timeline/use-time-travel';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useIsPhoneLayout } from '@/lib/use-is-phone-layout';
import { useTimeZone } from '@/lib/use-time-zone';
import { useRequiredParam } from '@/lib/use-required-param';
import { cn } from '@/lib/utils';
import { ConnectionBanner } from './connection-banner';
import { RELOAD_FAILED_MESSAGE } from './connection-copy';
import { creatorTicketOf } from './collaboration-config';
import { DocumentNotReadyError, documentFileQueryKey, openedDocumentQueryKey } from './editor-api';
import { DOCUMENT_LOAD_ERROR_MESSAGE, EXPORT_FAILED_MESSAGE, LOADING_DOCUMENT_MESSAGE } from './editor-copy';
import { EditorHeader } from './editor-header';
import { EditorToolbarRow } from './editor-toolbar-row';
import { LOADING_DOCUMENT_REASON_ID } from './download-menu';
import { VersionBanner } from '@/features/versions/version-banner';
import { VersionFrame } from '@/features/versions/version-frame';
import { OpeningDocument } from './opening-document';
import { ReadinessAnnouncement } from './readiness-announcement';
import { SuperDocEditor } from './superdoc-editor';
import { SUPERSEDED_REPORT, useConnectionState } from './use-connection-state';
import { useDocumentFile } from './use-document-file';
import { useEditorSetup } from './use-editor-setup';
import { useMembers } from './use-members';
import { DocumentReadiness, useOpenedDocument } from './use-opened-document';
import { WaitingForDocument } from './waiting-for-document';

const EDITOR_AREA_CLASS = 'relative flex min-h-[60dvh] min-w-0 flex-1 flex-col lg:min-h-0';
const PANEL_LAYOUT_CLASS: Record<PanelPosition, string> = {
  [PanelPosition.Bottom]: 'flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-y-visible',
  [PanelPosition.Side]: 'flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-y-visible',
};
const DIMMED_EDITOR_AREA_CLASS = 'opacity-60';
const VERSION_PROGRESS_CLASS = 'h-0.5 w-full animate-pulse bg-primary motion-reduce:animate-none';

export function DocumentPage() {
  const documentId = useRequiredParam('documentId');
  const { user } = useSession();
  const { data: opened, readiness, keepWaiting, restartWaiting, retry, isFetchedAfterMount } = useOpenedDocument(documentId);
  const openedAfterMount = isFetchedAfterMount ? opened : undefined;
  const { data: file, error: fileError } = useDocumentFile({ documentId, roomMode: openedAfterMount?.roomMode });
  const { members, isUnavailable, isCurrentUserOnline, membersAnsweredAt, isSessionEnded, isAttemptSuperseded } = useMembers({
    documentId,
    creatorTicket: openedAfterMount ? creatorTicketOf(openedAfterMount) : null,
  });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const {
    state: connectionState,
    failureReason,
    reportTransport,
    resetConnection,
  } = useConnectionState({
    documentId,
    isCurrentUserOnline,
    membersAnsweredAt,
    isSessionEnded,
  });
  useEffect(() => {
    if (isAttemptSuperseded) reportTransport(SUPERSEDED_REPORT);
  }, [isAttemptSuperseded, reportTransport]);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [hasReloadFailed, setHasReloadFailed] = useState(false);
  const [superdoc, setSuperdoc] = useState<SuperDoc | null>(null);
  const [editorContainer, setEditorContainer] = useState<HTMLElement | null>(null);
  const [toolbarContainer, setToolbarContainer] = useState<HTMLElement | null>(null);
  const [hasExportFailed, setHasExportFailed] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(isPanelOpenByDefault);
  const { position } = usePanelPosition();
  const isPhoneLayout = useIsPhoneLayout();
  const { timeZone } = useTimeZone();
  const summarize = useSummarize({ documentId });
  const editorSetup = useEditorSetup({ opened: openedAfterMount, user, file, generation: editorGeneration });
  const timeTravel = useTimeTravel({ documentId, isEnabled: opened !== undefined && !isUnavailable });
  useDocumentTitle(opened ? opened.document.title : null);

  function withAnnouncement(page: ReactNode): ReactNode {
    return (
      <>
        <ReadinessAnnouncement readiness={readiness} />
        {page}
      </>
    );
  }

  if (readiness === DocumentReadiness.Opening) return withAnnouncement(<OpeningDocument />);
  if (isUnavailable) {
    return withAnnouncement(
      <WaitingForDocument documentId={documentId} readiness={DocumentReadiness.Unavailable} onKeepWaiting={keepWaiting} onRetry={retry} />,
    );
  }
  if (readiness !== DocumentReadiness.Ready) {
    return withAnnouncement(
      <WaitingForDocument documentId={documentId} readiness={readiness} onKeepWaiting={keepWaiting} onRetry={retry} />,
    );
  }
  if (!opened) return withAnnouncement(<OpeningDocument />);

  const { title } = opened.document;
  const { roomMode } = opened;
  const isReader = opened.role === DocumentRole.Reader;
  const isViewingPastVersion = timeTravel.state === VersionViewerState.Viewing;
  const isToolbarReady = isReader || toolbarContainer !== null;

  function renderUseWithAi(slot?: UseWithAiSlot): ReactNode {
    return <UseWithAiDialog title={title} canEdit={!isReader} {...slot} />;
  }

  function summarizeAndOpenPanel(): void {
    setIsPanelOpen(true);
    summarize.summarize();
  }

  function downloadLiveDocument(): void {
    if (!superdoc) return;
    setHasExportFailed(false);
    superdoc.export({ exportedName: title, triggerDownload: true }).catch(() => setHasExportFailed(true));
  }

  async function reload(): Promise<void> {
    setIsReloading(true);
    setHasReloadFailed(false);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: openedDocumentQueryKey(documentId), exact: true }, { throwOnError: true }),
        queryClient.refetchQueries({ queryKey: documentFileQueryKey({ documentId, roomMode }), exact: true }, { throwOnError: true }),
      ]);
      resetConnection();
      setEditorGeneration((generation) => generation + 1);
    } catch (error) {
      if (!(error instanceof DocumentNotReadyError)) return setHasReloadFailed(true);
      restartWaiting();
      resetConnection();
      setEditorGeneration((generation) => generation + 1);
    } finally {
      setIsReloading(false);
    }
  }

  function signInAgain(): void {
    navigate(signInPathFor(location), { state: SIGNED_OUT_STATE });
  }

  const isLoadingRequestedVersion = timeTravel.isLoading && timeTravel.requestedSequence !== null;
  const versionBar = (
    <>
      <VersionBanner timeTravel={timeTravel} timeZone={timeZone} />
      {isLoadingRequestedVersion && <div role="status" aria-label={LOADING_VERSION_MESSAGE} className={VERSION_PROGRESS_CLASS} />}
    </>
  );
  function backToDocuments(): void {
    navigate(AppRoute.Documents);
  }

  function failureAction(): () => void {
    if (failureReason === ConnectionFailureReason.SessionEnded) return signInAgain;
    if (failureReason === ConnectionFailureReason.Superseded) return backToDocuments;
    return reload;
  }

  const isFailed = connectionState === ConnectionState.Failed;
  const isSuperseded = failureReason === ConnectionFailureReason.Superseded;
  const isLoadingLineShown = !fileError && !isSuperseded;
  const isEditingSurfaceInert = isViewingPastVersion || isFailed;

  return withAnnouncement(
    <div className="flex h-dvh flex-col">
      <EditorHeader
        opened={opened}
        members={members}
        currentUserId={user ? user.id : null}
        superdoc={superdoc}
        editorContainer={editorContainer}
        isPastVersion={isViewingPastVersion}
        onDownloadDocx={downloadLiveDocument}
        renderUseWithAi={renderUseWithAi}
      />
      {superdoc === null && (
        <div id={LOADING_DOCUMENT_REASON_ID}>
          {fileError && <ErrorMessage className="px-4 py-1">{DOCUMENT_LOAD_ERROR_MESSAGE}</ErrorMessage>}
          {isLoadingLineShown && (
            <p role="status" className="sr-only">
              {LOADING_DOCUMENT_MESSAGE}
            </p>
          )}
        </div>
      )}
      {hasExportFailed && <ErrorMessage className="px-4 py-2">{EXPORT_FAILED_MESSAGE}</ErrorMessage>}
      <ConnectionBanner state={connectionState} failureReason={failureReason} isReloading={isReloading} onAction={failureAction()} />
      {hasReloadFailed && <ErrorMessage className="px-4 py-2">{RELOAD_FAILED_MESSAGE}</ErrorMessage>}
      <EditorToolbarRow
        role={opened.role}
        containerRef={setToolbarContainer}
        isToolbarInert={isEditingSurfaceInert}
        isRowInert={isFailed}
        isRunning={summarize.isRunning}
        onSummarize={summarizeAndOpenPanel}
      />
      {isPhoneLayout && versionBar}
      <div className={PANEL_LAYOUT_CLASS[position]}>
        <div data-testid="editor-area" className={cn(EDITOR_AREA_CLASS, isFailed && DIMMED_EDITOR_AREA_CLASS)}>
          {!isPhoneLayout && versionBar}
          <div
            data-testid="editor-surface"
            className={cn('relative flex min-h-0 min-w-0 flex-1', isLoadingRequestedVersion && DIMMED_EDITOR_AREA_CLASS)}
          >
            {editorSetup && isToolbarReady && (
              <SuperDocEditor
                key={editorGeneration}
                onSuperdocChange={setSuperdoc}
                onContainerChange={setEditorContainer}
                toolbarContainer={toolbarContainer}
                documentId={documentId}
                roomMode={editorSetup.roomMode}
                creatorTicket={editorSetup.creatorTicket}
                role={editorSetup.role}
                user={editorSetup.user}
                colorSlot={editorSetup.colorSlot}
                file={editorSetup.file}
                isInert={isEditingSurfaceInert}
                isSuperseded={isSuperseded}
                onTransportReport={reportTransport}
              />
            )}
            <VersionFrame
              documentId={documentId}
              version={timeTravel.shownVersion}
              requestedSequence={timeTravel.requestedSequence}
              runs={timeTravel.runs}
              onReady={timeTravel.reportReady}
              onFailed={timeTravel.reportFailure}
              onExit={timeTravel.backToLive}
            />
          </div>
        </div>
        <TimelinePanel
          documentId={documentId}
          role={opened.role}
          position={position}
          isOpen={isPanelOpen}
          onOpenChange={setIsPanelOpen}
          summarize={summarize}
          isLoadingVersion={isLoadingRequestedVersion}
          lastEditAt={null}
          onTravel={timeTravel.travelTo}
          onBackToLive={timeTravel.backToLive}
        />
      </div>
    </div>,
  );
}
