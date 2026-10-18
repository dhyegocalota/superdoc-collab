import { DocumentRole, VersionViewerState } from '@superdoc-collab/types';
import { useState, type ReactNode } from 'react';
import type { SuperDoc } from 'superdoc';
import { ErrorMessage } from '@/components/error-message';
import { useSession } from '@/features/auth/use-session';
import { UseWithAiDialog, type UseWithAiSlot } from '@/features/connected-apps/use-with-ai-dialog';
import { TimelinePanel } from '@/features/timeline/timeline-panel';
import { isPanelOpenByDefault, PanelPosition, usePanelPosition } from '@/features/timeline/use-panel-position';
import { useSummarize } from '@/features/timeline/use-summarize';
import { useTimeTravel } from '@/features/timeline/use-time-travel';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useRequiredParam } from '@/lib/use-required-param';
import { DOCUMENT_LOAD_ERROR_MESSAGE, EXPORT_FAILED_MESSAGE, LOADING_DOCUMENT_MESSAGE } from './editor-copy';
import { EditorHeader } from './editor-header';
import { EditorToolbarRow } from './editor-toolbar-row';
import { LOADING_DOCUMENT_REASON_ID } from './download-menu';
import { VersionBanner } from '@/features/versions/version-banner';
import { VersionFrame } from '@/features/versions/version-frame';
import { OpeningDocument } from './opening-document';
import { ReadinessAnnouncement } from './readiness-announcement';
import { SuperDocEditor } from './superdoc-editor';
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

export function DocumentPage() {
  const documentId = useRequiredParam('documentId');
  const { user } = useSession();
  const { data: opened, readiness, keepWaiting, retry, isFetchedAfterMount } = useOpenedDocument(documentId);
  const openedAfterMount = isFetchedAfterMount ? opened : undefined;
  const { data: file, error: fileError } = useDocumentFile({ documentId, roomMode: openedAfterMount?.roomMode });
  const { members, isUnavailable } = useMembers(documentId);
  const [superdoc, setSuperdoc] = useState<SuperDoc | null>(null);
  const [editorContainer, setEditorContainer] = useState<HTMLElement | null>(null);
  const [toolbarContainer, setToolbarContainer] = useState<HTMLElement | null>(null);
  const [hasExportFailed, setHasExportFailed] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(isPanelOpenByDefault);
  const { position } = usePanelPosition();
  const summarize = useSummarize({ documentId });
  const editorSetup = useEditorSetup({ opened: openedAfterMount, user, file });
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
      {superdoc === null && !fileError && (
        <p id={LOADING_DOCUMENT_REASON_ID} role="status" className="px-4 py-1 text-xs text-muted-foreground">
          {LOADING_DOCUMENT_MESSAGE}
        </p>
      )}
      {hasExportFailed && <ErrorMessage className="px-4 py-2">{EXPORT_FAILED_MESSAGE}</ErrorMessage>}
      <EditorToolbarRow
        role={opened.role}
        containerRef={setToolbarContainer}
        isToolbarInert={isViewingPastVersion}
        isRunning={summarize.isRunning}
        onSummarize={summarizeAndOpenPanel}
      />
      <div className={PANEL_LAYOUT_CLASS[position]}>
        <div data-testid="editor-area" className={EDITOR_AREA_CLASS}>
          <VersionBanner timeTravel={timeTravel} />
          <div className="relative flex min-h-0 min-w-0 flex-1">
            {editorSetup && isToolbarReady && (
              <SuperDocEditor
                onSuperdocChange={setSuperdoc}
                onContainerChange={setEditorContainer}
                toolbarContainer={toolbarContainer}
                documentId={documentId}
                roomMode={editorSetup.roomMode}
                role={editorSetup.role}
                user={editorSetup.user}
                file={editorSetup.file}
                isInert={isViewingPastVersion}
              />
            )}
            {fileError && <ErrorMessage className="flex-1 p-4">{DOCUMENT_LOAD_ERROR_MESSAGE}</ErrorMessage>}
            <VersionFrame
              documentId={documentId}
              version={timeTravel.shownVersion}
              requestedSequence={timeTravel.requestedSequence}
              runs={timeTravel.runs}
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
          onTravel={timeTravel.travelTo}
          onBackToLive={timeTravel.backToLive}
        />
      </div>
    </div>,
  );
}
