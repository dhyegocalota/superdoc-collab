import { documentPagePath, MINUTE_MS, type DocumentSummary } from '@superdoc-collab/types';
import { Link } from 'react-router';
import { formatIdleDuration } from '@/lib/format-date-time';
import { DocumentListKind } from './document-columns';
import { DocumentThumbnail } from './document-thumbnail';
import { DOCUMENT_DETAILS_SEPARATOR, EDITED_JUST_NOW_LABEL, editedAgoLabel, ROLE_LABELS } from './documents-copy';

const CARD_CLASS =
  'relative flex flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-xs [contain-intrinsic-size:auto_360px] [content-visibility:auto]';

const IDENTITY_BY_KIND: Record<DocumentListKind, (document: DocumentSummary) => string> = {
  [DocumentListKind.Mine]: (document) => ROLE_LABELS[document.role],
  [DocumentListKind.Shared]: (document) => document.owner.name,
};

function editedLabel(updatedAt: number): string {
  const durationMs = Date.now() - updatedAt;
  if (durationMs < MINUTE_MS) return EDITED_JUST_NOW_LABEL;
  return editedAgoLabel(formatIdleDuration({ durationMs }));
}

type DocumentCardProps = { document: DocumentSummary; kind: DocumentListKind };

export function DocumentCard({ document, kind }: DocumentCardProps) {
  return (
    <article className={CARD_CLASS}>
      <DocumentThumbnail title={document.title} preview={document.preview} />
      <div className="space-y-1 p-3">
        <h3 className="line-clamp-2 font-medium break-words">
          <Link
            to={documentPagePath(document.id)}
            className="outline-none after:absolute after:inset-0 hover:underline focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
          >
            {document.title}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">
          {[IDENTITY_BY_KIND[kind](document), editedLabel(document.updatedAt)].join(DOCUMENT_DETAILS_SEPARATOR)}
        </p>
      </div>
    </article>
  );
}
