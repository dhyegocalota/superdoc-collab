import { documentPagePath, type DocumentSummary } from '@superdoc-history/types';
import { Link } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatTimestamp } from '@/lib/format-date-time';
import { COLUMN_HEADERS } from './documents-copy';

type DocumentTableProps = {
  documents: DocumentSummary[];
  emptyMessage: string;
};

export function DocumentTable({ documents, emptyMessage }: DocumentTableProps) {
  if (documents.length === 0) return <p className="rounded-md border p-4 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMN_HEADERS.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((document) => (
            <TableRow key={document.id}>
              <TableCell className="font-medium">
                <Link to={documentPagePath(document.id)} className="hover:underline">
                  {document.title}
                </Link>
              </TableCell>
              <TableCell>{document.owner.name}</TableCell>
              <TableCell>{formatTimestamp(document.updatedAt)}</TableCell>
              <TableCell>
                <Badge variant="secondary">{document.role}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
