import { AppRoute, DocumentRole, READ_ONLY_BADGE_LABEL, type DocumentMember, type OpenedDocument } from '@superdoc-collab/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Ellipsis } from 'lucide-react';
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import type { SuperDoc } from 'superdoc';
import { AppTopBar } from '@/components/app-top-bar';
import { ErrorMessage } from '@/components/error-message';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AccountMenu } from '@/features/account/account-menu';
import { USE_WITH_AI_LABEL } from '@/features/connected-apps/connected-apps-copy';
import type { UseWithAiSlot } from '@/features/connected-apps/use-with-ai-dialog';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { cn } from '@/lib/utils';
import { deleteDocument } from './editor-api';
import {
  CANCEL_LABEL,
  DELETE_CONFIRM_LABEL,
  DELETE_DIALOG_DESCRIPTION,
  DELETE_DIALOG_TITLE,
  DELETE_FAILED_MESSAGE,
  DELETE_LABEL,
  DOWNLOAD_FORMAT_LABELS,
  MORE_ACTIONS_LABEL,
  RENAME_FAILED_MESSAGE,
} from './editor-copy';
import { DocumentTitle } from './document-title';
import { DownloadFormat } from './download-format';
import { DownloadMenu, LOADING_DOCUMENT_REASON_ID, useDownload } from './download-menu';
import { FindButton } from './find-button';
import { Members } from './members';
import { ShareDialog } from './share-dialog';

type DocumentIdentity = { documentId: string };

function DeleteDocumentDialog({
  documentId,
  isOpen,
  onOpenChange,
  returnFocusRef,
}: DocumentIdentity & { isOpen: boolean; onOpenChange: (isOpen: boolean) => void; returnFocusRef: RefObject<HTMLButtonElement | null> }) {
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
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{DELETE_DIALOG_TITLE}</DialogTitle>
          <DialogDescription>{DELETE_DIALOG_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        {isError && <ErrorMessage>{DELETE_FAILED_MESSAGE}</ErrorMessage>}
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

type DocumentActionsMenuProps = DocumentIdentity & {
  isOwner: boolean;
  isReady: boolean;
  onDownload: (format: DownloadFormat) => void;
  renderUseWithAi: (slot?: UseWithAiSlot) => ReactNode;
};

function keepMenuOpen(event: Event): void {
  event.preventDefault();
}

function DocumentActionsMenu({ documentId, isOwner, isReady, onDownload, renderUseWithAi }: DocumentActionsMenuProps) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button ref={triggerRef} variant="ghost" size="icon" aria-label={MORE_ACTIONS_LABEL} className={cn(!isOwner && 'sm:hidden')}>
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{MORE_ACTIONS_LABEL}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          {renderUseWithAi({
            trigger: (
              <DropdownMenuItem className="sm:hidden" onSelect={keepMenuOpen}>
                <Bot aria-hidden />
                {USE_WITH_AI_LABEL}
              </DropdownMenuItem>
            ),
            returnFocusRef: triggerRef,
          })}
          {Object.values(DownloadFormat).map((format) => (
            <DropdownMenuItem
              key={format}
              className="sm:hidden"
              disabled={!isReady}
              aria-describedby={isReady ? undefined : LOADING_DOCUMENT_REASON_ID}
              onSelect={() => onDownload(format)}
            >
              {DOWNLOAD_FORMAT_LABELS[format]}
            </DropdownMenuItem>
          ))}
          {isOwner && (
            <DropdownMenuItem variant="destructive" onSelect={() => setIsDeleteOpen(true)}>
              {DELETE_LABEL}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <DeleteDocumentDialog documentId={documentId} isOpen={isDeleteOpen} onOpenChange={setIsDeleteOpen} returnFocusRef={triggerRef} />
    </>
  );
}

type EditorHeaderProps = {
  opened: OpenedDocument;
  members: DocumentMember[];
  currentUserId: string | null;
  superdoc: SuperDoc | null;
  isPastVersion: boolean;
  onDownloadDocx: () => void;
  renderUseWithAi: (slot?: UseWithAiSlot) => ReactNode;
};

export function EditorHeader({
  opened,
  members,
  currentUserId,
  superdoc,
  isPastVersion,
  onDownloadDocx,
  renderUseWithAi,
}: EditorHeaderProps) {
  const { document, role } = opened;
  const isReader = role === DocumentRole.Reader;
  const isOwner = role === DocumentRole.Owner;
  const { download, printView } = useDownload({ superdoc, onDownloadDocx });
  const [hasRenameFailed, setHasRenameFailed] = useState(false);

  return (
    <>
      <AppTopBar
        left={
          <>
            <span aria-hidden className="h-5 w-px shrink-0 bg-border" />
            <DocumentTitle documentId={document.id} title={document.title} role={role} onFailureChange={setHasRenameFailed} />
            {isReader && <Badge variant="secondary">{READ_ONLY_BADGE_LABEL}</Badge>}
          </>
        }
        right={
          <>
            <div className="hidden sm:block">
              <Members members={members} currentUserId={currentUserId} superdoc={superdoc} isPastVersion={isPastVersion} />
            </div>
            <FindButton superdoc={superdoc} />
            <div className="hidden sm:block">{renderUseWithAi()}</div>
            {isOwner && <ShareDialog documentId={document.id} />}
            <DownloadMenu isDisabled={superdoc === null} onDownload={download} />
            <DocumentActionsMenu
              documentId={document.id}
              isOwner={isOwner}
              isReady={superdoc !== null}
              onDownload={download}
              renderUseWithAi={renderUseWithAi}
            />
            <AccountMenu />
          </>
        }
      />
      {hasRenameFailed && <ErrorMessage className="px-4 py-2">{RENAME_FAILED_MESSAGE}</ErrorMessage>}
      {printView}
    </>
  );
}
