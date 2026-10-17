import { ConnectionState, DOCUMENT_UNAVAILABLE_MESSAGE, VersionViewerState } from '@superdoc-collab/types';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { SuperDoc } from 'superdoc';
import { ErrorMessage } from '@/components/error-message';
import { useSession } from '@/features/auth/use-session';
import { TimelinePanel } from '@/features/timeline/timeline-panel';
import { useTimeTravel } from '@/features/timeline/use-time-travel';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useRequiredParam } from '@/lib/use-required-param';
import { cn } from '@/lib/utils';
import { ConnectionBanner } from './connection-banner';
import { RELOAD_FAILED_MESSAGE } from './connection-copy';
import { documentFileQueryKey, openedDocumentQueryKey } from './editor-api';
import { DOCUMENT_LOAD_ERROR_MESSAGE, EXPORT_FAILED_MESSAGE, LOADING_DOCUMENT_MESSAGE } from './editor-copy';
import { EditorHeader } from './editor-header';
import { VersionBanner } from '@/features/versions/version-banner';
import { VersionFrame } from '@/features/versions/version-frame';
import { OpeningDocument } from './opening-document';
import { SuperDocEditor } from './superdoc-editor';
import { UnavailableNotice } from './unavailable-notice';
import { useConnectionState } from './use-connection-state';
import { useDocumentFile } from './use-document-file';
import { useEditorSetup } from './use-editor-setup';
import { useMembers } from './use-members';
import { useOpenedDocument } from './use-opened-document';

const EDITOR_AREA_CLASS = 'relative flex min-h-[60dvh] min-w-0 flex-1 flex-col lg:min-h-0';
const FAILED_EDITOR_AREA_CLASS = 'opacity-60';

export function DocumentPage() {
  const documentId = useRequiredParam('documentId');
  const { user } = useSession();
  const { data: opened, error, isFetchedAfterMount } = useOpenedDocument(documentId);
  const openedAfterMount = isFetchedAfterMount ? opened : undefined;
  const { data: file, error: fileError } = useDocumentFile({ documentId, roomMode: openedAfterMount?.roomMode });
  const { members, isUnavailable, isCurrentUserOnline, membersAnsweredAt } = useMembers(documentId);
  const queryClient = useQueryClient();
  const {
    state: connectionState,
    failureReason,
    reportTransport,
    resetConnection,
  } = useConnectionState({
    documentId,
    isCurrentUserOnline,
    membersAnsweredAt,
  });
  const [editorGeneration, setEditorGeneration] = useState(0);
  const [isReloading, setIsReloading] = useState(false);
  const [hasReloadFailed, setHasReloadFailed] = useState(false);
  const superdocRef = useRef<SuperDoc | null>(null);
  const [hasExportFailed, setHasExportFailed] = useState(false);
  const editorSetup = useEditorSetup({ opened: openedAfterMount, user, file, generation: editorGeneration });
  const timeTravel = useTimeTravel({ documentId, isEnabled: opened !== undefined && !isUnavailable });
  useDocumentTitle(opened ? opened.document.title : null);

  if (error && !opened) return <UnavailableNotice message={error.message} />;
  if (isUnavailable) return <UnavailableNotice message={DOCUMENT_UNAVAILABLE_MESSAGE} />;
  if (!opened) return <OpeningDocument />;

  const { title } = opened.document;
  const { roomMode } = opened;

  function downloadLiveDocument(): void {
    const superdoc = superdocRef.current;
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
    } catch {
      setHasReloadFailed(true);
    } finally {
      setIsReloading(false);
    }
  }

  const isFailed = connectionState === ConnectionState.Failed;

  return (
    <div className="flex h-dvh flex-col">
      <EditorHeader
        opened={opened}
        members={members}
        currentUserId={user ? user.id : null}
        onDownload={editorSetup ? downloadLiveDocument : undefined}
      />
      {hasExportFailed && <ErrorMessage className="px-4 py-2">{EXPORT_FAILED_MESSAGE}</ErrorMessage>}
      <ConnectionBanner state={connectionState} failureReason={failureReason} isReloading={isReloading} onReload={reload} />
      {hasReloadFailed && <ErrorMessage className="px-4 py-2">{RELOAD_FAILED_MESSAGE}</ErrorMessage>}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-y-visible">
        <div data-testid="editor-area" className={cn(EDITOR_AREA_CLASS, isFailed && FAILED_EDITOR_AREA_CLASS)}>
          <VersionBanner timeTravel={timeTravel} />
          <div className="relative flex min-h-0 min-w-0 flex-1">
            {editorSetup && (
              <SuperDocEditor
                key={editorGeneration}
                superdocRef={superdocRef}
                documentId={documentId}
                roomMode={editorSetup.roomMode}
                role={editorSetup.role}
                user={editorSetup.user}
                file={editorSetup.file}
                isInert={timeTravel.state === VersionViewerState.Viewing || isFailed}
                onTransportReport={reportTransport}
              />
            )}
            {!editorSetup && !fileError && (
              <p role="status" className="flex-1 p-4 text-sm text-muted-foreground">
                {LOADING_DOCUMENT_MESSAGE}
              </p>
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
        <TimelinePanel documentId={documentId} role={opened.role} onTravel={timeTravel.travelTo} onBackToLive={timeTravel.backToLive} />
      </div>
    </div>
  );
}
