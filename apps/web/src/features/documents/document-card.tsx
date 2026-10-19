import type { DocumentSummary } from '@superdoc-collab/types';
import type { DocumentListKind } from './document-columns';

type DocumentCardProps = { document: DocumentSummary; kind: DocumentListKind };

export function DocumentCard(_props: DocumentCardProps): never {
  throw new Error('DocumentCard is not implemented');
}
