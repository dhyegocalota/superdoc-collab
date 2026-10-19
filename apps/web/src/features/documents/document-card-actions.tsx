import { documentPagePath, LINK_COPIED_MESSAGE } from '@superdoc-collab/types';
import { Ellipsis } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { COPY_DOCUMENT_LINK_FAILED_MESSAGE, COPY_DOCUMENT_LINK_LABEL, documentActionsLabel, OPEN_DOCUMENT_LABEL } from './documents-copy';

type DocumentCardActionsProps = { documentId: string; title: string };

export function DocumentCardActions({ documentId, title }: DocumentCardActionsProps) {
  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${documentPagePath(documentId)}`);
      toast(LINK_COPIED_MESSAGE);
    } catch {
      toast.error(COPY_DOCUMENT_LINK_FAILED_MESSAGE);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative z-10 size-11 shrink-0" aria-label={documentActionsLabel(title)}>
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link to={documentPagePath(documentId)}>{OPEN_DOCUMENT_LABEL}</Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copyLink}>{COPY_DOCUMENT_LINK_LABEL}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
