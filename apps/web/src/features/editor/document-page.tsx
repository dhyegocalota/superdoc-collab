import { AppRoute, type DocumentMember, type RoomMode } from '@superdoc-history/types';
import { skipToken, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { SessionSkeleton } from '@/features/auth/session-skeleton';
import { useSession } from '@/features/auth/use-session';
import { useRequiredParam } from '@/lib/use-required-param';
import { documentFileQueryKey, fetchDocumentFile, fetchMembers, MEMBERS_REFRESH_MS, membersQueryKey } from './editor-api';
import { BACK_TO_DOCUMENTS_LABEL } from './editor-copy';
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

function useMembers(documentId: string): DocumentMember[] {
  const { data } = useQuery({ queryKey: membersQueryKey(documentId), queryFn: () => fetchMembers(documentId), refetchInterval: MEMBERS_REFRESH_MS });
  if (!data) return NO_MEMBERS;
  return data.members;
}

export function DocumentPage() {
  const documentId = useRequiredParam('documentId');
  const { user } = useSession();
  const { data: opened, error } = useOpenedDocument(documentId);
  const { data: file } = useDocumentFile({ documentId, roomMode: opened?.roomMode });
  const members = useMembers(documentId);
  const setup = useEditorSetup({ opened, user, file });

  if (error) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-4 p-6">
        <p role="alert">{error.message}</p>
        <Link to={AppRoute.Documents} className="underline">
          {BACK_TO_DOCUMENTS_LABEL}
        </Link>
      </main>
    );
  }
  if (!opened) return <SessionSkeleton />;

  return (
    <div className="flex h-dvh flex-col">
      <EditorHeader opened={opened} members={members} />
      <div className="flex min-h-0 flex-1">
        {setup && <SuperDocEditor documentId={documentId} roomMode={setup.roomMode} role={setup.role} user={setup.user} file={setup.file} />}
        <TimelinePanelPlaceholder />
      </div>
    </div>
  );
}
