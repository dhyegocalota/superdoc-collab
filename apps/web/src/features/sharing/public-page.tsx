import {
  ApiPath,
  documentPagePath,
  DocumentRole,
  PREPARING_POLL_MS,
  PUBLIC_SUMMARY_REFRESH_MS,
  PublicAccess,
  RoomMode,
  type PublicOpened,
} from '@superdoc-collab/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router';
import { AppTopBar } from '@/components/app-top-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SuperDocEditor } from '@/features/editor/superdoc-editor';
import { TransportReading, type TransportReport } from '@/features/editor/use-connection-state';
import { useDocumentFile } from '@/features/editor/use-document-file';
import { DocumentUnavailableError, ServerBusyError } from '@/lib/api';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useRequiredParam } from '@/lib/use-required-param';
import { fetchPublicOpened, fetchPublicSummary, PublicRateLimitedError, publicOpenedQueryKey, publicSummaryQueryKey } from './public-api';
import {
  PUBLIC_CONNECTION_FAILED_MESSAGE,
  PUBLIC_LOAD_FAILED_MESSAGE,
  PUBLIC_OPENING_MESSAGE,
  PUBLIC_RELOAD_LABEL,
  PUBLIC_RETRY_LABEL,
  PUBLIC_UNAVAILABLE_MESSAGE,
  PUBLIC_VIEWER_EMAIL,
  PUBLIC_VIEW_ONLY_LABEL,
  publicViewerLabel,
} from './public-copy';
import { PublicSummaryCard } from './public-summary-card';
import { ViewerAvatar } from './viewer-avatar';

type VisitorAccess = Extract<PublicOpened, { access: PublicAccess.Visitor }>;

function ignore(): void {
  return undefined;
}

function PublicNotice({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-4 p-6">
      <p role="status" className="text-sm text-muted-foreground">
        {message}
      </p>
      {action}
    </main>
  );
}

function PublicDocumentView({ opened, onReload }: { opened: VisitorAccess; onReload: () => void }) {
  const { document, viewer, roomToken } = opened;
  const { data: file } = useDocumentFile({ documentId: document.id, roomMode: RoomMode.Join });
  const { data: latest } = useQuery({
    queryKey: publicSummaryQueryKey(document.id),
    queryFn: () => fetchPublicSummary(document.id),
    refetchInterval: PUBLIC_SUMMARY_REFRESH_MS,
  });
  const [hasTransportFailed, setHasTransportFailed] = useState(false);
  const [hasEditorFailed, setHasEditorFailed] = useState(false);
  const user = useMemo(() => ({ id: viewer.id, name: viewer.name, email: PUBLIC_VIEWER_EMAIL }), [viewer]);
  const handleTransportReport = useCallback(
    (report: TransportReport): void => {
      if (report.reading !== TransportReading.Failed) return;
      setHasTransportFailed(true);
      onReload();
    },
    [onReload],
  );
  const handleLoadProgress = useCallback((progress: { hasFailed: boolean }): void => setHasEditorFailed(progress.hasFailed), []);
  const hasFailed = hasTransportFailed || hasEditorFailed;

  return (
    <div className="flex h-full flex-col">
      <AppTopBar
        left={
          <>
            <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
            <h1 className="truncate text-sm font-medium">{document.title}</h1>
            <Badge variant="secondary">{PUBLIC_VIEW_ONLY_LABEL}</Badge>
          </>
        }
        right={
          <div className="flex items-center gap-2 text-sm">
            <ViewerAvatar viewer={viewer} />
            <span className="hidden sm:inline">{publicViewerLabel(viewer.name)}</span>
          </div>
        }
      />
      {latest?.summary && <PublicSummaryCard latest={latest.summary} />}
      {hasFailed && (
        <div role="alert" className="flex items-center gap-3 border-b px-3 py-2 text-sm">
          <span>{PUBLIC_CONNECTION_FAILED_MESSAGE}</span>
          <Button size="sm" variant="outline" onClick={onReload}>
            {PUBLIC_RELOAD_LABEL}
          </Button>
        </div>
      )}
      <div className="flex min-h-0 min-w-0 flex-1">
        {file && (
          <SuperDocEditor
            onSuperdocChange={ignore}
            onContainerChange={ignore}
            toolbarContainer={null}
            documentId={document.id}
            roomMode={RoomMode.Join}
            role={DocumentRole.Reader}
            user={user}
            colorSlot={viewer.colorSlot}
            file={file}
            isInert={false}
            collaborationPath={ApiPath.PublicCollaboration}
            collaborationToken={roomToken}
            onTransportReport={handleTransportReport}
            onEditorUpdate={ignore}
            onDocumentEdit={ignore}
            onLoadProgress={handleLoadProgress}
          />
        )}
      </div>
    </div>
  );
}

export function PublicPage() {
  const documentId = useRequiredParam('documentId');
  const queryClient = useQueryClient();
  const { data: opened, error } = useQuery({
    queryKey: publicOpenedQueryKey(documentId),
    queryFn: () => fetchPublicOpened(documentId),
    retry: false,
    gcTime: 0,
    staleTime: Infinity,
    refetchInterval: (query) => (query.state.error instanceof ServerBusyError ? PREPARING_POLL_MS : false),
  });
  useDocumentTitle(opened?.access === PublicAccess.Visitor ? opened.document.title : null);
  const askAgain = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: publicOpenedQueryKey(documentId) });
  }, [queryClient, documentId]);
  const retry = (
    <Button variant="outline" onClick={askAgain}>
      {PUBLIC_RETRY_LABEL}
    </Button>
  );

  if (error instanceof DocumentUnavailableError) return <PublicNotice message={PUBLIC_UNAVAILABLE_MESSAGE} />;
  if (opened?.access === PublicAccess.Member) return <Navigate to={documentPagePath(documentId)} replace />;
  if (opened?.access === PublicAccess.Visitor) return <PublicDocumentView key={opened.roomToken} opened={opened} onReload={askAgain} />;
  if (error instanceof ServerBusyError) return <PublicNotice message={error.message} />;
  if (error instanceof PublicRateLimitedError) return <PublicNotice message={error.message} action={retry} />;
  if (error) return <PublicNotice message={PUBLIC_LOAD_FAILED_MESSAGE} action={retry} />;
  return <PublicNotice message={PUBLIC_OPENING_MESSAGE} />;
}
