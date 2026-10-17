import { DOCUMENT_UNAVAILABLE_MESSAGE, VersionViewerState } from '@superdoc-history/types';
import { useRef, useState } from 'react';
import { useLocation } from 'react-router';
import type { SuperDoc } from 'superdoc';
import { useSession } from '@/features/auth/use-session';
import { isNewDocumentState } from '@/features/documents/new-document-state';
import { TimelinePanel } from '@/features/timeline/timeline-panel';
import { useTimeTravel } from '@/features/timeline/use-time-travel';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useRequiredParam } from '@/lib/use-required-param';
import { DOCUMENT_LOAD_ERROR_MESSAGE, EXPORT_FAILED_MESSAGE, LOADING_DOCUMENT_MESSAGE } from './editor-copy';
import { EditorHeader } from './editor-header';
import { VersionBanner } from '@/features/versions/version-banner';
import { VersionFrame } from '@/features/versions/version-frame';
import { OpeningDocument } from './opening-document';
import { SuperDocEditor } from './superdoc-editor';
import { UnavailableNotice } from './unavailable-notice';
import { useDocumentFile } from './use-document-file';
import { useEditorSetup } from './use-editor-setup';
import { useMembers } from './use-members';
import { useOpenedDocument } from './use-opened-document';

const EDITOR_AREA_CLASS = 'relative flex min-h-[60dvh] min-w-0 flex-1 flex-col lg:min-h-0';

export function DocumentPage() {
  const documentId = useRequiredParam('documentId');
  const { user } = useSession();
  const location = useLocation();
  const { data: opened, error, isFetchedAfterMount } = useOpenedDocument(documentId);
  const openedAfterMount = isFetchedAfterMount ? opened : undefined;
  const { data: file, error: fileError } = useDocumentFile({ documentId, roomMode: openedAfterMount?.roomMode });
  const { members, isUnavailable } = useMembers(documentId);
  const superdocRef = useRef<SuperDoc | null>(null);
  const [hasExportFailed, setHasExportFailed] = useState(false);
  const editorSetup = useEditorSetup({ opened: openedAfterMount, user, file });
  const timeTravel = useTimeTravel({ documentId, isEnabled: opened !== undefined && !isUnavailable });
  useDocumentTitle(opened ? opened.document.title : null);

  if (error) return <UnavailableNotice message={error.message} />;
  if (isUnavailable) return <UnavailableNotice message={DOCUMENT_UNAVAILABLE_MESSAGE} />;
  if (!opened) return <OpeningDocument />;

  const { title } = opened.document;

  function downloadLiveDocument(): void {
    const superdoc = superdocRef.current;
    if (!superdoc) return;
    setHasExportFailed(false);
    superdoc.export({ exportedName: title, triggerDownload: true }).catch(() => setHasExportFailed(true));
  }

  return (
    <div className="flex h-dvh flex-col">
      <EditorHeader
        opened={opened}
        members={members}
        currentUserId={user ? user.id : null}
        onDownload={editorSetup ? downloadLiveDocument : null}
      />
      {hasExportFailed && (
        <p role="alert" className="px-4 py-2 text-sm text-destructive">
          {EXPORT_FAILED_MESSAGE}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-y-visible">
        <div data-testid="editor-area" className={EDITOR_AREA_CLASS}>
          <VersionBanner timeTravel={timeTravel} />
          <div className="relative flex min-h-0 min-w-0 flex-1">
            {editorSetup && (
              <SuperDocEditor
                superdocRef={superdocRef}
                documentId={documentId}
                roomMode={editorSetup.roomMode}
                role={editorSetup.role}
                user={editorSetup.user}
                file={editorSetup.file}
                isInert={timeTravel.state === VersionViewerState.Viewing}
                focusOnReady={isNewDocumentState(location.state)}
              />
            )}
            {!editorSetup && !fileError && (
              <p role="status" className="flex-1 p-4 text-sm text-muted-foreground">
                {LOADING_DOCUMENT_MESSAGE}
              </p>
            )}
            {fileError && (
              <p role="alert" className="flex-1 p-4 text-sm text-destructive">
                {DOCUMENT_LOAD_ERROR_MESSAGE}
              </p>
            )}
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
