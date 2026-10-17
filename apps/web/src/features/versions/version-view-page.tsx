import type { EditRunView } from '@superdoc-history/types';
import { useCallback, useEffect, useState } from 'react';
import type { SuperDoc } from 'superdoc';
import { SessionSkeleton } from '@/features/auth/session-skeleton';
import { useSession } from '@/features/auth/use-session';
import { readViewerMessage, ViewerMessageKind } from '@/features/editor/viewer-messages';
import { VersionViewer } from '@/features/editor/version-viewer';
import { VERSION_FAILED_MESSAGE } from '@/features/timeline/timeline-copy';
import { useOpenedDocument } from '@/features/editor/use-opened-document';
import { useRequiredParam } from '@/lib/use-required-param';
import { useRunHighlights } from './use-run-highlights';

const NO_RUNS: EditRunView[] = [];

function postToParent(kind: ViewerMessageKind.Ready | ViewerMessageKind.Failed): void {
  window.parent.postMessage({ kind }, window.location.origin);
}

export function VersionViewPage() {
  const documentId = useRequiredParam('documentId');
  const sequence = Number(useRequiredParam('sequence'));
  const isSequenceValid = Number.isInteger(sequence);
  const { user } = useSession();
  const { data: opened, error: openError } = useOpenedDocument(documentId);
  const [superdoc, setSuperdoc] = useState<SuperDoc | null>(null);
  const [hasConnectionFailed, setHasConnectionFailed] = useState(false);
  const [runs, setRuns] = useState<EditRunView[]>(NO_RUNS);
  useRunHighlights({ superdoc, runs });

  const handleReady = useCallback((readySuperdoc: SuperDoc) => {
    setSuperdoc(readySuperdoc);
    postToParent(ViewerMessageKind.Ready);
  }, []);
  const handleFailed = useCallback(() => postToParent(ViewerMessageKind.Failed), []);
  const handleConnectionFailed = useCallback(() => {
    setHasConnectionFailed(true);
    postToParent(ViewerMessageKind.Failed);
  }, []);

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      const message = readViewerMessage({ event, expectedSource: window.parent });
      if (message?.kind === ViewerMessageKind.Highlight) setRuns(message.runs);
      if (message?.kind === ViewerMessageKind.Clear) setRuns(NO_RUNS);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const hasOpenFailed = openError !== null;

  useEffect(() => {
    if (!isSequenceValid || hasOpenFailed) postToParent(ViewerMessageKind.Failed);
  }, [isSequenceValid, hasOpenFailed]);

  if (!isSequenceValid) return null;
  if (openError) return <p role="alert" className="p-4 text-sm text-destructive">{openError.message}</p>;
  if (hasConnectionFailed) return <p role="alert" className="p-4 text-sm text-destructive">{VERSION_FAILED_MESSAGE}</p>;
  if (!user || !opened) return <SessionSkeleton />;
  return <VersionViewer documentId={documentId} sequence={sequence} user={user} onReady={handleReady} onFailed={handleFailed} onConnectionFailed={handleConnectionFailed} />;
}
