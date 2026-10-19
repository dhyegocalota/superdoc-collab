import type { DocumentSummary } from '@superdoc-collab/types';
import { DocumentCard } from './document-card';
import type { DocumentListKind } from './document-columns';
import { DocumentListEmpty } from './document-list-empty';

type DocumentCardsProps = { documents: DocumentSummary[]; emptyMessage: string; kind: DocumentListKind };

export function DocumentCards({ documents, emptyMessage, kind }: DocumentCardsProps) {
  if (documents.length === 0) return <DocumentListEmpty message={emptyMessage} />;
  return (
    <ul data-testid="document-cards" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {documents.map((document) => (
        <li key={document.id}>
          <DocumentCard document={document} kind={kind} />
        </li>
      ))}
    </ul>
  );
}
