import { useEffect, useRef, useState } from 'react';
import { DocumentReadiness } from './use-opened-document';
import { DOCUMENT_READY_ANNOUNCEMENT } from './waiting-copy';

const WAITING_READINESS: DocumentReadiness[] = [DocumentReadiness.Waiting, DocumentReadiness.Paused];

export function ReadinessAnnouncement({ readiness }: { readiness: DocumentReadiness }) {
  const previousReadiness = useRef(readiness);
  const [hasBecomeReady, setHasBecomeReady] = useState(false);

  useEffect(() => {
    const wasWaiting = WAITING_READINESS.includes(previousReadiness.current);
    previousReadiness.current = readiness;
    if (wasWaiting && readiness === DocumentReadiness.Ready) setHasBecomeReady(true);
  }, [readiness]);

  return (
    <p role="status" className="sr-only">
      {hasBecomeReady && DOCUMENT_READY_ANNOUNCEMENT}
    </p>
  );
}
