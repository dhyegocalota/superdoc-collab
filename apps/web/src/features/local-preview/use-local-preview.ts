import type { DocumentReadiness } from '@/features/editor/use-opened-document';

export function useLocalPreview({ documentId, readiness }: { documentId: string; readiness: DocumentReadiness }): File | null {
  return null;
}
