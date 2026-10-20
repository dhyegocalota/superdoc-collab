import {
  ConnectionFailureReason,
  ConnectionState,
  DocumentRole,
  OPEN_PROGRESS_DELAY_MS,
  RoomMode,
  VersionViewerState,
} from '@superdoc-collab/types';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { SuperDoc } from 'superdoc';
import { useSession } from '@/features/auth/use-session';
import { editorOpenView, preparingHereView, type EditorLoadProgress } from '@/features/open-progress/open-progress-view';
import { scrollToFraction } from '@/features/local-preview/scroll-fraction';
import { useDelayedReveal } from '@/features/open-progress/use-delayed-reveal';
import { useOpenStartedAt } from '@/features/open-progress/use-open-started-at';
import { useHasPaintedParagraph } from '@/features/open-progress/use-has-painted-paragraph';
import { LocalPreview } from '@/features/local-preview/local-preview';
import { useCanPreviewOnDevice, useDeviceRefusal } from '@/features/local-preview/device-guard';
import { useLocalPreview } from '@/features/local-preview/use-local-preview';
import { UseWithAiDialog, type UseWithAiSlot } from '@/features/connected-apps/use-with-ai-dialog';
import { TimelinePanel } from '@/features/timeline/timeline-panel';
import { useLastEditAt } from '@/features/timeline/use-last-edit-at';
import { PanelPosition, usePanelPosition } from '@/features/timeline/use-panel-position';
import { useSummarize } from '@/features/timeline/use-summarize';
import { useTimeTravel } from '@/features/timeline/use-time-travel';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useIsPhoneLayout } from '@/lib/use-is-phone-layout';
import { useTimeZone } from '@/lib/use-time-zone';
import { useRequiredParam } from '@/lib/use-required-param';
import { cn } from '@/lib/utils';
import { EditorHeader } from './editor-header';
import { EditorStatus } from './editor-status';
import { DIMMED_EDITOR_AREA_CLASS, EditorSurface } from './editor-surface';
import { EditorToolbarRow } from './editor-toolbar-row';
import { ExitConfirmationDialog } from './exit-confirmation-dialog';
import { OpeningDocument } from './opening-document';
import { ReadinessAnnouncement } from './readiness-announcement';
import { useCachedTitle } from './use-cached-title';
import { useConnectionState, type TransportReport } from './use-connection-state';
import { useConnectionFailureAction } from './use-connection-failure-action';
import { useDocumentFile } from './use-document-file';
import { useDocumentReload } from './use-document-reload';
import { useEditorSetup } from './use-editor-setup';
import { useHeavyRoomsRetry } from './use-heavy-rooms-retry';
import { useRefusalProbe } from './use-refusal-probe';
import { useMembers } from './use-members';
import { DocumentReadiness, useOpenedDocument } from './use-opened-document';
import { clearUnsyncedEdits, setUnsynced } from './unsynced-edits-store';
import { useThumbnailCapture } from './use-thumbnail-capture';
import { useUnsyncedEdits } from './use-unsynced-edits';
import { VersionBar } from './version-bar';
import { WaitingForDocument } from './waiting-for-document';

const EDITOR_AREA_CLASS = 'relative flex min-h-[60dvh] min-w-0 flex-1 flex-col lg:min-h-0';
const INITIAL_LOAD_PROGRESS: EditorLoadProgress = { isSynced: false, pageCount: 0, hasFailed: false };
const PANEL_LAYOUT_CLASS: Record<PanelPosition, string> = {
  [PanelPosition.Bottom]: 'flex min-h-0 flex-1 flex-col overflow-y-auto lg:overflow-y-visible',
  [PanelPosition.Side]: 'flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-y-visible',
};

export function DocumentPage() {
  const documentId = useRequiredParam('documentId');
  const { user } = useSession();
  const {
    data: opened,
    error: openFailure,
    bootstrap,
    preparedOnDeviceOf,
    bootstrapAnsweredAt,
    readiness,
    retry,
    isFetchedAfterMount,
  } = useOpenedDocument(documentId);
  const openedAfterMount = isFetchedAfterMount ? opened : undefined;
  const { data: file, error: fileError } = useDocumentFile({ documentId, roomMode: openedAfterMount?.roomMode });
  const { lastEditAt, markEdit } = useLastEditAt();
  const { members, isUnavailable, isCurrentUserOnline, membersAnsweredAt, isSessionEnded } = useMembers(documentId);
  const {
    state: connectionState,
    failureReason: reportedFailureReason,
    reportTransport,
    resetConnection,
  } = useConnectionState({
    documentId,
    isCurrentUserOnline,
    membersAnsweredAt,
    isSessionEnded,
  });
  const { editorGeneration, isReloading, hasReloadFailed, reload } = useDocumentReload({
    documentId,
    roomMode: opened?.roomMode,
    resetConnection,
  });
  const { failureReason, failureMessage } = useRefusalProbe({ documentId, failureReason: reportedFailureReason });
  const connectionAction = useConnectionFailureAction({ failureReason, reload });
  useHeavyRoomsRetry({ failureReason, failureMessage, reload });
  const [superdoc, setSuperdoc] = useState<SuperDoc | null>(null);
  const [editorContainer, setEditorContainer] = useState<HTMLElement | null>(null);
  const [toolbarContainer, setToolbarContainer] = useState<HTMLElement | null>(null);
  const [loadProgress, setLoadProgress] = useState(INITIAL_LOAD_PROGRESS);
  const [hasExportFailed, setHasExportFailed] = useState(false);
  const [isTitleDirty, setIsTitleDirty] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const hasPaintedParagraph = useHasPaintedParagraph(editorContainer);
  const isProgressShown = useDelayedReveal({ delayMs: OPEN_PROGRESS_DELAY_MS, resetKey: documentId });
  const startedAt = useOpenStartedAt(documentId);
  const { position } = usePanelPosition();
  const isPhoneLayout = useIsPhoneLayout();
  const { timeZone } = useTimeZone();
  const summarize = useSummarize({ documentId });
  const editorSetup = useEditorSetup({ opened: openedAfterMount, user, file, generation: editorGeneration });
  const timeTravel = useTimeTravel({ documentId, isEnabled: opened !== undefined && !isUnavailable });
  useDocumentTitle(opened ? opened.document.title : null);
  const cachedTitle = useCachedTitle(documentId);
  const deviceGuardRefusal = useDeviceRefusal();
  const canPreviewOnDevice = useCanPreviewOnDevice();
  const isDeviceJobCreatedHere = opened !== undefined && opened.roomMode === RoomMode.Create && preparedOnDeviceOf !== null;
  const isDeviceEditorUsable = loadProgress.isSynced && hasPaintedParagraph;
  const isCreatingOnDevice = isDeviceJobCreatedHere && !isDeviceEditorUsable;
  const isOpenFailing = connectionState === ConnectionState.Failed || loadProgress.hasFailed || fileError !== null;
  const previewFile = useLocalPreview({
    documentId,
    readiness: isUnavailable ? DocumentReadiness.Unavailable : readiness,
    isLiveEditorPainted: hasPaintedParagraph || isOpenFailing,
    isPreparingHere: isDeviceJobCreatedHere && deviceGuardRefusal === null && canPreviewOnDevice,
  });
  const previewScrollFraction = useRef<number | null>(null);
  useEffect(() => {
    if (!hasPaintedParagraph || editorContainer === null || previewScrollFraction.current === null) return;
    scrollToFraction({ element: editorContainer, fraction: previewScrollFraction.current });
    previewScrollFraction.current = null;
  }, [hasPaintedParagraph, editorContainer]);
  const {
    isUnsynced,
    reportEdit,
    reportTransport: reportSyncedTransport,
  } = useUnsyncedEdits({
    connectionState,
    isTitleDirty,
    isReader: opened?.role === DocumentRole.Reader,
  });
  useEffect(() => setUnsynced(isUnsynced), [isUnsynced]);
  useEffect(() => clearUnsyncedEdits, []);
  useThumbnailCapture({ documentId, isReader: opened?.role === DocumentRole.Reader, connectionState, lastEditAt, editorContainer });
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

  function renderPage(): ReactNode {
    if (readiness === DocumentReadiness.Opening) return withAnnouncement(<OpeningDocument />);
    const documentReadiness = isUnavailable ? DocumentReadiness.Unavailable : readiness;
    const deviceRefusal = isDeviceJobCreatedHere ? deviceGuardRefusal : null;
    if (deviceRefusal !== null) {
      return withAnnouncement(
        <WaitingForDocument
          documentId={documentId}
          readiness={DocumentReadiness.Waiting}
          progress={{ bootstrap, preparedOnDeviceOf, answeredAt: bootstrapAnsweredAt, startedAt, isShown: isProgressShown }}
          failure={null}
          deviceRefusal={deviceRefusal}
          onRetry={retry}
        />,
      );
    }
    if (documentReadiness !== DocumentReadiness.Ready) {
      return withAnnouncement(
        <WaitingForDocument
          documentId={documentId}
          readiness={documentReadiness}
          progress={{ bootstrap, preparedOnDeviceOf, answeredAt: bootstrapAnsweredAt, startedAt, isShown: isProgressShown }}
          failure={openFailure}
          deviceRefusal={null}
          onRetry={retry}
        />,
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
    const isEditingSurfaceInert = isViewingPastVersion || isFailed;
    const isOpenProgressVisible = isProgressShown && !isOpenFailing && previewFile === null && (isCreatingOnDevice || !hasPaintedParagraph);
    const openProgress = isOpenProgressVisible
      ? (elapsedSeconds: number) =>
          isCreatingOnDevice
            ? preparingHereView({ estimatedMs: opened.bootstrap.estimatedMs, elapsedSeconds })
            : editorOpenView({ loadProgress, stateBytes: opened.bootstrap.stateBytes, elapsedSeconds })
      : null;

    return withAnnouncement(
      <div className="flex h-full flex-col">
        <EditorHeader
          opened={opened}
          members={members}
          currentUserId={user ? user.id : null}
          superdoc={superdoc}
          editorContainer={editorContainer}
          isPastVersion={isViewingPastVersion}
          onDownloadDocx={downloadLiveDocument}
          onToggleEditsPanel={() => setIsPanelOpen((isOpen) => !isOpen)}
          onSummarize={summarizeAndOpenPanel}
          onTitleDirtyChange={setIsTitleDirty}
          renderUseWithAi={renderUseWithAi}
        />
        <EditorStatus
          isDocumentLoading={superdoc === null}
          hasFileError={fileError !== null}
          hasExportFailed={hasExportFailed}
          hasReloadFailed={hasReloadFailed}
          isReloading={isReloading}
          connectionState={connectionState}
          failureReason={failureReason}
          failureMessage={failureMessage}
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
              title={title}
              openProgress={openProgress}
              openStartedAt={startedAt}
              editorSetup={editorSetup}
              editorGeneration={editorGeneration}
              isToolbarReady={isToolbarReady}
              toolbarContainer={toolbarContainer}
              isInert={isEditingSurfaceInert}
              isDimmed={isLoadingRequestedVersion}
              timeTravel={timeTravel}
              onSuperdocChange={setSuperdoc}
              onContainerChange={setEditorContainer}
              onTransportReport={handleTransportReport}
              onEditorUpdate={markEdit}
              onDocumentEdit={reportEdit}
              onLoadProgress={setLoadProgress}
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

  const isPreviewReplacingPage = previewFile !== null && readiness === DocumentReadiness.Waiting;
  const isPreviewFrozen = !isPreviewReplacingPage && !isDeviceJobCreatedHere;
  const previewLayer =
    previewFile === null ? null : (
      <LocalPreview
        title={cachedTitle}
        file={previewFile}
        bootstrap={bootstrap}
        answeredAt={bootstrapAnsweredAt}
        startedAt={startedAt}
        isProgressShown={isProgressShown}
        isSwapping={!isPreviewReplacingPage}
        isFrozen={isPreviewFrozen}
        swappingViewAt={(elapsedSeconds) => {
          if (isCreatingOnDevice)
            return preparingHereView({ estimatedMs: bootstrap === null ? null : bootstrap.estimatedMs, elapsedSeconds });
          return editorOpenView({ loadProgress, stateBytes: bootstrap === null ? null : bootstrap.stateBytes, elapsedSeconds });
        }}
        onScrollFraction={(fraction) => {
          previewScrollFraction.current = fraction;
        }}
      />
    );

  return (
    <>
      {isPreviewReplacingPage ? <ReadinessAnnouncement readiness={readiness} /> : renderPage()}
      {previewLayer}
    </>
  );
}
