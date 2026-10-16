import type { EditRunView } from '@superdoc-history/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SuperDoc } from 'superdoc';
import { SessionSkeleton } from '@/features/auth/session-skeleton';
import { useSession } from '@/features/auth/use-session';
import { readViewerMessage, ViewerMessageKind } from '@/features/editor/viewer-messages';
import { VersionViewer } from '@/features/editor/version-viewer';
import { useRequiredParam } from '@/lib/use-required-param';
import { useRunHighlights } from './use-run-highlights';

const NO_RUNS: EditRunView[] = [];

function postToParent(kind: ViewerMessageKind.Ready | ViewerMessageKind.Failed): void {
  window.parent.postMessage({ kind }, window.location.origin);
}

export function VersionViewPage() {
  const documentId = useRequiredParam('documentId');
  const sequence = Number(useRequiredParam('sequence'));
  const { user } = useSession();
  const superdocRef = useRef<SuperDoc | null>(null);
  const [runs, setRuns] = useState<EditRunView[]>(NO_RUNS);
  useRunHighlights({ superdocRef, runs });

  const handleReady = useCallback((superdoc: SuperDoc) => {
    superdocRef.current = superdoc;
    postToParent(ViewerMessageKind.Ready);
  }, []);
  const handleFailed = useCallback(() => postToParent(ViewerMessageKind.Failed), []);

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      const message = readViewerMessage({ event, expectedSource: window.parent });
      if (message?.kind === ViewerMessageKind.Highlight) setRuns(message.runs);
      if (message?.kind === ViewerMessageKind.Clear) setRuns(NO_RUNS);
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  if (!user) return <SessionSkeleton />;
  return <VersionViewer documentId={documentId} sequence={sequence} user={user} onReady={handleReady} onFailed={handleFailed} />;
}
