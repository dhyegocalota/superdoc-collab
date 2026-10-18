import { DOCUMENT_UNAVAILABLE_MESSAGE, VERSION_FAILED_MESSAGE, type EditRunView } from '@superdoc-collab/types';
import { useCallback, useEffect, useState } from 'react';
import type { SuperDoc } from 'superdoc';
import { ErrorMessage } from '@/components/error-message';
import { SessionSkeleton } from '@/features/auth/session-skeleton';
import { useSession } from '@/features/auth/use-session';
import { readViewerMessage, ViewerMessageKind } from './viewer-messages';
import { VersionViewer } from './version-viewer';
import { DocumentReadiness, useOpenedDocumentWithoutPolling } from '@/features/editor/use-opened-document';
import { useDocumentTitle } from '@/lib/use-document-title';
import { useEscapeKey } from '@/lib/use-escape-key';
import { useRequiredParam } from '@/lib/use-required-param';
import { useWindowMessage } from '@/lib/use-window-message';
import { useRunHighlights } from './use-run-highlights';

const NO_RUNS: EditRunView[] = [];

function postToParent(kind: ViewerMessageKind.Ready | ViewerMessageKind.Failed | ViewerMessageKind.Exit): void {
  window.parent.postMessage({ kind }, window.location.origin);
}

export function VersionViewPage() {
  const documentId = useRequiredParam('documentId');
  const sequence = Number(useRequiredParam('sequence'));
  const isSequenceValid = Number.isInteger(sequence);
  const { user } = useSession();
  const { data: opened, error: openError, readiness } = useOpenedDocumentWithoutPolling(documentId);
  useDocumentTitle(opened ? opened.document.title : null);
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

  useWindowMessage((event) => {
    const message = readViewerMessage({ event, expectedSource: window.parent });
    if (message === null) return;
    if (message.kind === ViewerMessageKind.Highlight) setRuns(message.runs);
    if (message.kind === ViewerMessageKind.Clear) setRuns(NO_RUNS);
  });
  useEscapeKey({ isEnabled: true, onEscape: () => postToParent(ViewerMessageKind.Exit) });

  const hasOpenFailed = readiness !== DocumentReadiness.Opening && readiness !== DocumentReadiness.Ready;

  useEffect(() => {
    if (!isSequenceValid || hasOpenFailed) postToParent(ViewerMessageKind.Failed);
  }, [isSequenceValid, hasOpenFailed]);

  if (!isSequenceValid) return null;
  if (openError) return <ErrorMessage className="p-4">{openError.message}</ErrorMessage>;
  if (hasOpenFailed) return <ErrorMessage className="p-4">{DOCUMENT_UNAVAILABLE_MESSAGE}</ErrorMessage>;
  if (hasConnectionFailed) return <ErrorMessage className="p-4">{VERSION_FAILED_MESSAGE}</ErrorMessage>;
  if (!user || !opened) return <SessionSkeleton />;
  return (
    <VersionViewer
      documentId={documentId}
      sequence={sequence}
      user={user}
      colorSlot={opened.colorSlot}
      onReady={handleReady}
      onFailed={handleFailed}
      onConnectionFailed={handleConnectionFailed}
    />
  );
}
