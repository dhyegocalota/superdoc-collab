import { useEffect } from 'react';
import { DocumentReadiness } from '@/features/editor/use-opened-document';
import { discardLocalFile, localFileOf } from './local-file-store';

const SETTLED_READINESS = [DocumentReadiness.Ready, DocumentReadiness.Failed, DocumentReadiness.Unavailable];

export function useLocalPreview({ documentId, readiness }: { documentId: string; readiness: DocumentReadiness }): File | null {
  const isSettled = SETTLED_READINESS.includes(readiness);

  useEffect(() => {
    if (isSettled) discardLocalFile(documentId);
  }, [isSettled, documentId]);

  if (readiness !== DocumentReadiness.Waiting) return null;
  return localFileOf(documentId);
}
