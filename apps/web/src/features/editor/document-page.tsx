import { ConnectionFailureReason, ConnectionState, DocumentRole, VersionViewerState } from '@superdoc-collab/types';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { SuperDoc } from 'superdoc';
import { useSession } from '@/features/auth/use-session';
import { UseWithAiDialog, type UseWithAiSlot } from '@/features/connected-apps/use-with-ai-dialog';
import { TimelinePanel } from '@/features/timeline/timeline-panel';
import { useLastEditAt } from '@/features/timeline/use-last-edit-at';
import { isPanelOpenByDefault, PanelPosition, usePanelPosition } from '@/features/timeline/use-panel-position';
import { useSummarize } from '@/features/timeline/use-summarize';
import { useTimeTravel } from '@/features/timeline/use-time-travel';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useIsPhoneLayout } from '@/lib/use-is-phone-layout';
import { useTimeZone } from '@/lib/use-time-zone';
import { useRequiredParam } from '@/lib/use-required-param';
import { cn } from '@/lib/utils';
import { creatorTicketOf } from './collaboration-config';
import { EditorHeader } from './editor-header';
import { EditorStatus } from './editor-status';
import { DIMMED_EDITOR_AREA_CLASS, EditorSurface } from './editor-surface';
import { EditorToolbarRow } from './editor-toolbar-row';
import { ExitConfirmationDialog } from './exit-confirmation-dialog';
import { OpeningDocument } from './opening-document';
import { ReadinessAnnouncement } from './readiness-announcement';
import { SUPERSEDED_REPORT, useConnectionState, type TransportReport } from './use-connection-state';
import { useConnectionFailureAction } from './use-connection-failure-action';
import { useDocumentFile } from './use-document-file';
import { useDocumentReload } from './use-document-reload';
import { useEditorSetup } from './use-editor-setup';
import { useMembers } from './use-members';
import { DocumentReadiness, useOpenedDocument } from './use-opened-document';
import { useUnsyncedEdits } from './use-unsynced-edits';
import { VersionBar } from './version-bar';
import { WaitingForDocument } from './waiting-for-document';

const EDITOR_AREA_CLASS = 'relative flex min-h-[60dvh] min-w-0 flex-1 flex-col lg:min-h-0';
const PANEL_LAYOUT_CLASS: Record<PanelPosition, string> = {
  [PanelPosition.Bottom]: 'flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-y-visible',
  [PanelPosition.Side]: 'flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-y-visible',
};

export function DocumentPage() {
  const documentId = useRequiredParam('documentId');
  const { user } = useSession();
  const { data: opened, readiness, keepWaiting, restartWaiting, retry, isFetchedAfterMount } = useOpenedDocument(documentId);
  const openedAfterMount = isFetchedAfterMount ? opened : undefined;
  const { data: file, error: fileError } = useDocumentFile({ documentId, roomMode: openedAfterMount?.roomMode });
  const { lastEditAt, markEdit } = useLastEditAt();
  const { members, isUnavailable, isCurrentUserOnline, membersAnsweredAt, isSessionEnded, isAttemptSuperseded } = useMembers({
    documentId,
    creatorTicket: openedAfterMount ? creatorTicketOf(openedAfterMount) : null,
  });
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
  const { editorGeneration, isReloading, hasReloadFailed, reload } = useDocumentReload({
    documentId,
    roomMode: opened?.roomMode,
    restartWaiting,
    resetConnection,
  });
  const connectionAction = useConnectionFailureAction({ failureReason, reload });
  const [superdoc, setSuperdoc] = useState<SuperDoc | null>(null);
  const [editorContainer, setEditorContainer] = useState<HTMLElement | null>(null);
  const [toolbarContainer, setToolbarContainer] = useState<HTMLElement | null>(null);
  const [hasExportFailed, setHasExportFailed] = useState(false);
  const [isTitleDirty, setIsTitleDirty] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(isPanelOpenByDefault);
  const { position } = usePanelPosition();
  const isPhoneLayout = useIsPhoneLayout();
  const { timeZone } = useTimeZone();
  const summarize = useSummarize({ documentId });
  const editorSetup = useEditorSetup({ opened: openedAfterMount, user, file, generation: editorGeneration });
  const timeTravel = useTimeTravel({ documentId, isEnabled: opened !== undefined && !isUnavailable });
  useDocumentTitle(opened ? opened.document.title : null);
  const {
    isUnsynced,
    reportEdit,
    reportTransport: reportSyncedTransport,
  } = useUnsyncedEdits({
    connectionState,
    isTitleDirty,
    isReader: opened?.role === DocumentRole.Reader,
  });
  const handleEditorUpdate = useCallback((): void => {
    markEdit();
    reportEdit();
  }, [markEdit, reportEdit]);
  const handleTransportReport = useCallback(
    (report: TransportReport): void => {
      reportTransport(report);
      reportSyncedTransport(report);
    },
    [reportTransport, reportSyncedTransport],
  );

  function withAnnouncement(page: ReactNode): ReactNode {
    return (
      <>
        <ReadinessAnnouncement readiness={readiness} />
        {page}
      </>
    );
  }

  if (readiness === DocumentReadiness.Opening) return withAnnouncement(<OpeningDocument />);
  const documentReadiness = isUnavailable ? DocumentReadiness.Unavailable : readiness;
  if (documentReadiness !== DocumentReadiness.Ready) {
    return withAnnouncement(
      <WaitingForDocument documentId={documentId} readiness={documentReadiness} onKeepWaiting={keepWaiting} onRetry={retry} />,
    );
  }
  if (!opened) return withAnnouncement(<OpeningDocument />);

  const { title } = opened.document;
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

  const isLoadingRequestedVersion = timeTravel.isLoading && timeTravel.requestedSequence !== null;
  const versionBar = <VersionBar timeTravel={timeTravel} timeZone={timeZone} isLoadingRequestedVersion={isLoadingRequestedVersion} />;
  const isFailed = connectionState === ConnectionState.Failed;
  const isSuperseded = failureReason === ConnectionFailureReason.Superseded;
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
        onTitleDirtyChange={setIsTitleDirty}
        renderUseWithAi={renderUseWithAi}
      />
      <EditorStatus
        isDocumentLoading={superdoc === null}
        hasFileError={fileError !== null}
        isSuperseded={isSuperseded}
        hasExportFailed={hasExportFailed}
        hasReloadFailed={hasReloadFailed}
        isReloading={isReloading}
        connectionState={connectionState}
        failureReason={failureReason}
        onConnectionAction={connectionAction}
      />
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
          <EditorSurface
            documentId={documentId}
            editorSetup={editorSetup}
            editorGeneration={editorGeneration}
            isToolbarReady={isToolbarReady}
            toolbarContainer={toolbarContainer}
            isInert={isEditingSurfaceInert}
            isSuperseded={isSuperseded}
            isDimmed={isLoadingRequestedVersion}
            timeTravel={timeTravel}
            onSuperdocChange={setSuperdoc}
            onContainerChange={setEditorContainer}
            onTransportReport={handleTransportReport}
            onEditorUpdate={handleEditorUpdate}
          />
        </div>
        <TimelinePanel
          documentId={documentId}
          role={opened.role}
          position={position}
          isOpen={isPanelOpen}
          onOpenChange={setIsPanelOpen}
          summarize={summarize}
          isLoadingVersion={isLoadingRequestedVersion}
          lastEditAt={lastEditAt}
          onTravel={timeTravel.travelTo}
          onBackToLive={timeTravel.backToLive}
        />
      </div>
      <ExitConfirmationDialog isUnsynced={isUnsynced} onDownload={downloadLiveDocument} />
    </div>,
  );
}
