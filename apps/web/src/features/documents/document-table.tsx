import { documentPagePath, type DocumentSummary } from '@superdoc-collab/types';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatTimestamp } from '@/lib/format-date-time';
import { useIsPhoneLayout } from '@/lib/use-is-phone-layout';
import { useTimeZone } from '@/lib/use-time-zone';
import { COLUMNS_BY_KIND, DocumentColumn, type DocumentListKind } from './document-columns';
import { COLUMN_LABELS, DOCUMENT_DETAILS_SEPARATOR, ROLE_LABELS } from './documents-copy';

type CellArguments = { document: DocumentSummary; timeZone: string };

const CELL_TEXT: Record<DocumentColumn, (args: CellArguments) => string> = {
  [DocumentColumn.Title]: ({ document }) => document.title,
  [DocumentColumn.Owner]: ({ document }) => document.owner.name,
  [DocumentColumn.Updated]: ({ document, timeZone }) => formatTimestamp({ time: document.updatedAt, timeZone }),
  [DocumentColumn.Access]: ({ document }) => ROLE_LABELS[document.role],
};

const CELL_CONTENT: Record<DocumentColumn, (args: CellArguments) => ReactNode> = {
  ...CELL_TEXT,
  [DocumentColumn.Title]: ({ document }) => (
    <Link to={documentPagePath(document.id)} className="font-medium hover:underline">
      {document.title}
    </Link>
  ),
  [DocumentColumn.Access]: (args) => <Badge variant="secondary">{CELL_TEXT[DocumentColumn.Access](args)}</Badge>,
};

type DocumentTableProps = {
  documents: DocumentSummary[];
  emptyMessage: string;
  kind: DocumentListKind;
};

export function DocumentTable({ documents, emptyMessage, kind }: DocumentTableProps) {
  const { timeZone } = useTimeZone();
  const isPhoneLayout = useIsPhoneLayout();
  const columns = COLUMNS_BY_KIND[kind];

  if (documents.length === 0) return <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  if (isPhoneLayout) {
    const detailColumns = columns.filter((column) => column !== DocumentColumn.Title);
    return (
      <ul className="divide-y rounded-md border">
        {documents.map((document) => (
          <li key={document.id} className="px-3 py-1">
            <Link to={documentPagePath(document.id)} className="flex min-h-11 items-center font-medium hover:underline">
              <span className="line-clamp-2 min-w-0 break-words">{document.title}</span>
            </Link>
            <p className="pb-2 text-sm text-muted-foreground">
              {detailColumns.map((column) => CELL_TEXT[column]({ document, timeZone })).join(DOCUMENT_DETAILS_SEPARATOR)}
            </p>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column}>{COLUMN_LABELS[column]}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((document) => (
            <TableRow key={document.id}>
              {columns.map((column) => (
                <TableCell key={column}>{CELL_CONTENT[column]({ document, timeZone })}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
