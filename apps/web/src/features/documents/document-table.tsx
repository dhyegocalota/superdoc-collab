import { documentPagePath, type DocumentSummary } from '@superdoc-history/types';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatTimestamp } from '@/lib/format-date-time';
import { cn } from '@/lib/utils';
import { COLUMNS_BY_KIND, DocumentColumn, type DocumentListKind, NARROW_HIDDEN_COLUMNS } from './document-columns';
import { COLUMN_LABELS, ROLE_LABELS } from './documents-copy';

const NARROW_HIDDEN_CLASS = 'hidden sm:table-cell';

const CELL_CONTENT: Record<DocumentColumn, (document: DocumentSummary) => ReactNode> = {
  [DocumentColumn.Title]: (document) => (
    <Link to={documentPagePath(document.id)} className="font-medium hover:underline">
      {document.title}
    </Link>
  ),
  [DocumentColumn.Owner]: (document) => document.owner.name,
  [DocumentColumn.Updated]: (document) => formatTimestamp(document.updatedAt),
  [DocumentColumn.Access]: (document) => <Badge variant="secondary">{ROLE_LABELS[document.role]}</Badge>,
};

type DocumentTableProps = {
  documents: DocumentSummary[];
  emptyMessage: string;
  kind: DocumentListKind;
};

export function DocumentTable({ documents, emptyMessage, kind }: DocumentTableProps) {
  const columns = COLUMNS_BY_KIND[kind];
  const hiddenWhenNarrow = NARROW_HIDDEN_COLUMNS[kind];

  function columnClass(column: DocumentColumn): string {
    return cn(hiddenWhenNarrow.includes(column) && NARROW_HIDDEN_CLASS);
  }

  if (documents.length === 0) return <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={column} className={columnClass(column)}>
                {COLUMN_LABELS[column]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((document) => (
            <TableRow key={document.id}>
              {columns.map((column) => (
                <TableCell key={column} className={columnClass(column)}>
                  {CELL_CONTENT[column](document)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
