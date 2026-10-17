import { AppRoute, DocumentRole, READ_ONLY_BADGE_LABEL, type DocumentMember, type OpenedDocument } from '@superdoc-history/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { KeyboardKey } from '@/lib/keyboard';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { deleteDocument, renameDocument } from './editor-api';
import {
  CANCEL_LABEL,
  DELETE_CONFIRM_LABEL,
  DELETE_DIALOG_DESCRIPTION,
  DELETE_DIALOG_TITLE,
  DELETE_FAILED_MESSAGE,
  DELETE_LABEL,
  DOWNLOAD_LABEL,
  MORE_ACTIONS_LABEL,
  RENAME_FAILED_MESSAGE,
  TITLE_LABEL,
} from './editor-copy';
import { HomeLink } from './home-link';
import { Members } from './members';
import { ShareDialog } from './share-dialog';

type DocumentIdentity = { documentId: string };

function TitleInput({ documentId, title }: DocumentIdentity & { title: string }) {
  const queryClient = useQueryClient();
  const { mutate, isError } = useMutation({
    mutationFn: renameDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY }),
  });

  function commit(input: HTMLInputElement): void {
    const nextTitle = input.value.trim();
    if (nextTitle === title) return;
    if (!nextTitle) {
      input.value = title;
      return;
    }
    mutate({ documentId, title: nextTitle });
  }

  return (
    <>
      <Input
        key={title}
        aria-label={TITLE_LABEL}
        defaultValue={title}
        className="min-w-0 flex-1 font-medium sm:max-w-sm"
        onBlur={(event) => commit(event.currentTarget)}
        onKeyDown={(event) => event.key === KeyboardKey.Enter && event.currentTarget.blur()}
      />
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {RENAME_FAILED_MESSAGE}
        </p>
      )}
    </>
  );
}

function DeleteDocumentDialog({
  documentId,
  isOpen,
  onOpenChange,
}: DocumentIdentity & { isOpen: boolean; onOpenChange: (isOpen: boolean) => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { mutate, isPending, isError } = useMutation({
    mutationFn: () => deleteDocument(documentId),
    onSuccess: async () => {
      await navigate(AppRoute.Documents);
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
    },
  });

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{DELETE_DIALOG_TITLE}</DialogTitle>
          <DialogDescription>{DELETE_DIALOG_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {isError && (
          <p role="alert" className="text-sm text-destructive">
            {DELETE_FAILED_MESSAGE}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{CANCEL_LABEL}</Button>
          </DialogClose>
          <Button variant="destructive" disabled={isPending} onClick={() => mutate()}>
            {DELETE_CONFIRM_LABEL}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DocumentActionsMenu({ documentId }: DocumentIdentity) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={MORE_ACTIONS_LABEL}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onSelect={() => setIsDeleteOpen(true)}>
            {DELETE_LABEL}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteDocumentDialog documentId={documentId} isOpen={isDeleteOpen} onOpenChange={setIsDeleteOpen} />
    </>
  );
}

export function EditorHeader({
  opened,
  members,
  currentUserId,
  onDownload,
}: {
  opened: OpenedDocument;
  members: DocumentMember[];
  currentUserId: string | null;
  onDownload: (() => void) | null;
}) {
  const { document, role } = opened;
  const isReader = role === DocumentRole.Reader;
  const isOwner = role === DocumentRole.Owner;

  return (
    <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
      <HomeLink />
      {isReader ? (
        <h1 className="min-w-0 flex-1 truncate font-medium">{document.title}</h1>
      ) : (
        <TitleInput documentId={document.id} title={document.title} />
      )}
      {isReader && <Badge variant="secondary">{READ_ONLY_BADGE_LABEL}</Badge>}
      <div className="ml-auto flex items-center gap-2">
        <Members members={members} currentUserId={currentUserId} />
        <Button variant="outline" aria-label={DOWNLOAD_LABEL} disabled={!onDownload} onClick={onDownload === null ? undefined : onDownload}>
          <Download />
          <span className="hidden sm:inline">{DOWNLOAD_LABEL}</span>
        </Button>
        {isOwner && <ShareDialog documentId={document.id} />}
        {isOwner && <DocumentActionsMenu documentId={document.id} />}
      </div>
    </header>
  );
}
