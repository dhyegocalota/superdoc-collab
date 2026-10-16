import { AppRoute, DOCUMENT_UNAVAILABLE_MESSAGE, type DocumentMember, type RoomMode } from '@superdoc-history/types';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Link } from 'react-router';
import type { SuperDoc } from 'superdoc';
import { SessionSkeleton } from '@/features/auth/session-skeleton';
import { useSession } from '@/features/auth/use-session';
import { useRequiredParam } from '@/lib/use-required-param';
import { DocumentUnavailableError, documentFileQueryKey, fetchDocumentFile, fetchMembers, MEMBERS_REFRESH_MS, membersQueryKey } from './editor-api';
import { BACK_TO_DOCUMENTS_LABEL, DOCUMENT_LOAD_ERROR_MESSAGE, EXPORT_FAILED_MESSAGE, LOADING_DOCUMENT_MESSAGE } from './editor-copy';
import { EditorHeader } from './editor-header';
import { SuperDocEditor } from './superdoc-editor';
import { TimelinePanelPlaceholder } from './timeline-panel-placeholder';
import { useEditorSetup } from './use-editor-setup';
import { useOpenedDocument } from './use-opened-document';

const NO_MEMBERS: DocumentMember[] = [];

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

  if (error) return <UnavailableNotice message={error.message} />;
  if (isUnavailable) return <UnavailableNotice message={DOCUMENT_UNAVAILABLE_MESSAGE} />;
  if (!opened) return <SessionSkeleton />;

  const { title } = opened.document;

  function downloadLiveDocument(): void {
    const superdoc = superdocRef.current;
    if (!superdoc) return;
    setHasExportFailed(false);
    superdoc.export({ exportedName: title, triggerDownload: true }).catch(() => setHasExportFailed(true));
  }

  return (
    <div className="flex h-dvh flex-col">
      <EditorHeader opened={opened} members={members} onDownload={setup ? downloadLiveDocument : null} />
      {hasExportFailed && <p role="alert" className="px-4 py-2 text-sm text-destructive">{EXPORT_FAILED_MESSAGE}</p>}
      <div className="flex min-h-0 flex-1">
        {setup && <SuperDocEditor superdocRef={superdocRef} documentId={documentId} roomMode={setup.roomMode} role={setup.role} user={setup.user} file={setup.file} />}
        {!setup && !fileError && <p role="status" className="flex-1 p-4 text-sm text-muted-foreground">{LOADING_DOCUMENT_MESSAGE}</p>}
        {fileError && <p role="alert" className="flex-1 p-4 text-sm text-destructive">{DOCUMENT_LOAD_ERROR_MESSAGE}</p>}
        <TimelinePanelPlaceholder />
      </div>
    </div>
  );
}
