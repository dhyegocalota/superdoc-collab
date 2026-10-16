import { documentPagePath, type DocumentSummary } from '@superdoc-history/types';
import { Link, useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const UPDATED_AT_FORMAT = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const COLUMN_COUNT = 4;

interface DocumentTableProps {
  documents: DocumentSummary[];
  emptyMessage: string;
}

export function DocumentTable({ documents, emptyMessage }: DocumentTableProps) {
  const navigate = useNavigate();

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead>My role</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.length === 0 && (
            <TableRow>
              <TableCell colSpan={COLUMN_COUNT} className="text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
          {documents.map((document) => (
            <TableRow key={document.id} className="cursor-pointer" onClick={() => navigate(documentPagePath(document.id))}>
              <TableCell className="font-medium">
                <Link to={documentPagePath(document.id)} className="hover:underline">
                  {document.title}
                </Link>
              </TableCell>
              <TableCell>{document.owner.name}</TableCell>
              <TableCell>{UPDATED_AT_FORMAT.format(document.updatedAt)}</TableCell>
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
