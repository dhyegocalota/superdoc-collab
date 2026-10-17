import { AppRoute, DOCUMENT_UNAVAILABLE_MESSAGE, VersionViewerState, type DocumentMember, type RoomMode } from '@superdoc-history/types';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import type { SuperDoc } from 'superdoc';
import { useSession } from '@/features/auth/use-session';
import { TimelinePanel } from '@/features/timeline/timeline-panel';
import { useTimeTravel } from '@/features/timeline/use-time-travel';
import { Skeleton } from '@/components/ui/skeleton';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useRequiredParam } from '@/lib/use-required-param';
import {
  DocumentUnavailableError,
  documentFileQueryKey,
  fetchDocumentFile,
  fetchMembers,
  MEMBERS_REFRESH_MS,
  membersQueryKey,
} from './editor-api';
import { BACK_TO_DOCUMENTS_LABEL, DOCUMENT_LOAD_ERROR_MESSAGE, EXPORT_FAILED_MESSAGE, LOADING_DOCUMENT_MESSAGE } from './editor-copy';
import { EditorHeader } from './editor-header';
import { HomeLink } from './home-link';
import { VersionBanner } from '@/features/versions/version-banner';
import { VersionFrame } from '@/features/versions/version-frame';
import { SuperDocEditor } from './superdoc-editor';
import { useEditorSetup } from './use-editor-setup';
import { useOpenedDocument } from './use-opened-document';

const NO_MEMBERS: DocumentMember[] = [];
const EDITOR_AREA_CLASS = 'relative flex min-h-[60dvh] min-w-0 flex-1 flex-col lg:min-h-0';

function useDocumentFile({ documentId, roomMode }: { documentId: string; roomMode: RoomMode | undefined }) {
  return useQuery({
    queryKey: documentFileQueryKey({ documentId, roomMode }),
    queryFn: roomMode === undefined ? skipToken : () => fetchDocumentFile({ documentId, roomMode }),
    staleTime: Infinity,
  });
}

function useMembers(documentId: string): { members: DocumentMember[]; isUnavailable: boolean } {
  const { data, error } = useQuery({
    queryKey: membersQueryKey(documentId),
    queryFn: () => fetchMembers(documentId),
    refetchInterval: (query) => (query.state.error instanceof DocumentUnavailableError ? false : MEMBERS_REFRESH_MS),
    retry: false,
  });
  const isUnavailable = error instanceof DocumentUnavailableError;
  if (!data) return { members: NO_MEMBERS, isUnavailable };
  return { members: data.members, isUnavailable };
}

function UnavailableNotice({ message }: { message: string }) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 p-6">
      <p role="alert">{message}</p>
      <Link to={AppRoute.Documents} className="underline">
        {BACK_TO_DOCUMENTS_LABEL}
      </Link>
    </main>
  );
}

function OpeningDocument() {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <HomeLink />
        <Skeleton className="h-9 w-full max-w-sm" />
      </header>
      <p role="status" className="p-4 text-sm text-muted-foreground">
        {LOADING_DOCUMENT_MESSAGE}
      </p>
    </div>
  );
}

export function DocumentPage() {
  const documentId = useRequiredParam('documentId');
  const { user } = useSession();
  const { data: opened, error, isFetchedAfterMount } = useOpenedDocument(documentId);
  const freshOpened = isFetchedAfterMount ? opened : undefined;
  const { data: file, error: fileError } = useDocumentFile({ documentId, roomMode: freshOpened?.roomMode });
  const { members, isUnavailable } = useMembers(documentId);
  const superdocRef = useRef<SuperDoc | null>(null);
  const [hasExportFailed, setHasExportFailed] = useState(false);
  const setup = useEditorSetup({ opened: freshOpened, user, file });
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
        onDownload={setup ? downloadLiveDocument : null}
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
            {setup && (
              <SuperDocEditor
                superdocRef={superdocRef}
                documentId={documentId}
                roomMode={setup.roomMode}
                role={setup.role}
                user={setup.user}
                file={setup.file}
                isInert={timeTravel.state === VersionViewerState.Viewing}
              />
            )}
            {!setup && !fileError && (
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
              version={timeTravel.shown}
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
