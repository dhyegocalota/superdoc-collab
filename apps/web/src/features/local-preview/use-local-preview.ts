import { useEffect, useState } from 'react';
import { DocumentReadiness } from '@/features/editor/use-opened-document';
import { discardLocalFile, localFileOf } from './local-file-store';

const ABANDONED_READINESS = [DocumentReadiness.Failed, DocumentReadiness.Unavailable];

export function useLocalPreview({
  documentId,
  readiness,
  isLiveEditorPainted,
  isPreparingHere,
}: {
  documentId: string;
  readiness: DocumentReadiness;
  isLiveEditorPainted: boolean;
  isPreparingHere: boolean;
}): File | null {
  const [hasPreviewed, setHasPreviewed] = useState(false);
  const file = localFileOf(documentId);
  const isWaiting = readiness === DocumentReadiness.Waiting;
  const isReady = readiness === DocumentReadiness.Ready;
  const isSwapping = isReady && hasPreviewed && !isLiveEditorPainted;
  const isDone = ABANDONED_READINESS.includes(readiness) || (isReady && !isSwapping);

  useEffect(() => {
    if (isWaiting && file !== null) setHasPreviewed(true);
  }, [isWaiting, file]);

  useEffect(() => {
    if (isDone) discardLocalFile(documentId);
  }, [isDone, documentId]);

  if (isWaiting || isSwapping) return file;
  return null;
}
