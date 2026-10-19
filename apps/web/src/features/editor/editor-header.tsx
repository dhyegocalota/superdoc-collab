import { AppRoute, DocumentRole, READ_ONLY_BADGE_LABEL, type DocumentMember, type OpenedDocument } from '@superdoc-collab/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bot, Ellipsis, Search } from 'lucide-react';
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
import { LARGE_BREAKPOINT_PX } from '@/lib/breakpoints';
import { useMinWidth } from '@/lib/use-min-width';
import { deleteDocument } from './editor-api';
import {
  CANCEL_LABEL,
  DELETE_CONFIRM_LABEL,
  DELETE_DIALOG_DESCRIPTION,
  DELETE_DIALOG_TITLE,
  DELETE_FAILED_MESSAGE,
  DELETE_LABEL,
  DOWNLOAD_FORMAT_LABELS,
  FIND_IN_DOCUMENT_LABEL,
  MORE_ACTIONS_LABEL,
  RENAME_FAILED_MESSAGE,
} from './editor-copy';
import { DocumentTitle } from './document-title';
import { DownloadFormat } from './download-format';
import { DownloadMenu, LOADING_DOCUMENT_REASON_ID, useDownload } from './download-menu';
import { FindButton, openFindBar } from './find-button';
import { Members } from './members';
import { allowLeave } from './unsynced-edits-store';
import { ShareDialog } from './share-dialog';

const DIVIDER_CLASS = 'h-5 w-px shrink-0 bg-border';
const EDITING_DIVIDER_CLASS = `max-md:hidden ${DIVIDER_CLASS}`;
const EDITING_RIGHT_GROUPS_CLASS = 'hidden md:contents';
const FOLDING_ACTION_CLASS = 'flex items-center max-lg:hidden';

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
      allowLeave();
      await navigate(AppRoute.Documents);
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY, exact: true });
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
  isLarge: boolean;
  superdoc: SuperDoc | null;
  onDownload: (format: DownloadFormat) => void;
  renderUseWithAi: (slot?: UseWithAiSlot) => ReactNode;
};

function DocumentActionsMenu({ documentId, isOwner, isLarge, superdoc, onDownload, renderUseWithAi }: DocumentActionsMenuProps) {
  const isReady = superdoc !== null;
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isUseWithAiOpen, setIsUseWithAiOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <DropdownMenu modal={false}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button ref={triggerRef} variant="ghost" size="icon" aria-label={MORE_ACTIONS_LABEL}>
                <Ellipsis aria-hidden />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>{MORE_ACTIONS_LABEL}</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          {!isLarge && (
            <DropdownMenuItem onSelect={() => openFindBar(superdoc)}>
              <Search aria-hidden />
              {FIND_IN_DOCUMENT_LABEL}
            </DropdownMenuItem>
          )}
          {!isLarge && (
            <DropdownMenuItem onSelect={() => setIsUseWithAiOpen(true)}>
              <Bot aria-hidden />
              {USE_WITH_AI_LABEL}
            </DropdownMenuItem>
          )}
          {!isLarge &&
            Object.values(DownloadFormat).map((format) => (
              <DropdownMenuItem
                key={format}
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
      {renderUseWithAi({ isOpen: isUseWithAiOpen, onOpenChange: setIsUseWithAiOpen, returnFocusRef: triggerRef })}
      <DeleteDocumentDialog documentId={documentId} isOpen={isDeleteOpen} onOpenChange={setIsDeleteOpen} returnFocusRef={triggerRef} />
    </>
  );
}

type EditorHeaderProps = {
  opened: OpenedDocument;
  members: DocumentMember[];
  currentUserId: string | null;
  superdoc: SuperDoc | null;
  editorContainer: HTMLElement | null;
  isPastVersion: boolean;
  onDownloadDocx: () => void;
  onTitleDirtyChange: (isDirty: boolean) => void;
  renderUseWithAi: (slot?: UseWithAiSlot) => ReactNode;
};

export function EditorHeader({
  opened,
  members,
  currentUserId,
  superdoc,
  editorContainer,
  isPastVersion,
  onDownloadDocx,
  onTitleDirtyChange,
  renderUseWithAi,
}: EditorHeaderProps) {
  const { document, role } = opened;
  const isReader = role === DocumentRole.Reader;
  const isOwner = role === DocumentRole.Owner;
  const { download, printView } = useDownload({ superdoc, onDownloadDocx });
  const isLarge = useMinWidth(LARGE_BREAKPOINT_PX);
  const hasActionsMenu = !isLarge || isOwner;
  const [hasRenameFailed, setHasRenameFailed] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const dividerClass = isEditingTitle ? EDITING_DIVIDER_CLASS : DIVIDER_CLASS;
  const rightGroupsClass = isEditingTitle ? EDITING_RIGHT_GROUPS_CLASS : 'contents';

  return (
    <>
      <AppTopBar
        left={
          <>
            <span aria-hidden className={dividerClass} />
            <DocumentTitle
              documentId={document.id}
              title={document.title}
              role={role}
              onFailureChange={setHasRenameFailed}
              onDirtyChange={onTitleDirtyChange}
              onEditingChange={setIsEditingTitle}
            />
            {isReader && <Badge variant="secondary">{READ_ONLY_BADGE_LABEL}</Badge>}
          </>
        }
        right={
          <div className={rightGroupsClass}>
            <div className="hidden sm:block">
              <Members
                documentId={document.id}
                members={members}
                currentUserId={currentUserId}
                superdoc={superdoc}
                editorContainer={editorContainer}
                isPastVersion={isPastVersion}
              />
            </div>
            {isLarge && (
              <div className={FOLDING_ACTION_CLASS}>
                <FindButton superdoc={superdoc} />
              </div>
            )}
            {isLarge && <div className={FOLDING_ACTION_CLASS}>{renderUseWithAi()}</div>}
            {isOwner && <ShareDialog documentId={document.id} />}
            {isLarge && (
              <div className={FOLDING_ACTION_CLASS}>
                <DownloadMenu isDisabled={superdoc === null} onDownload={download} />
              </div>
            )}
            {hasActionsMenu && (
              <DocumentActionsMenu
                documentId={document.id}
                isOwner={isOwner}
                isLarge={isLarge}
                superdoc={superdoc}
                onDownload={download}
                renderUseWithAi={renderUseWithAi}
              />
            )}
            <AccountMenu colorSlot={opened.colorSlot} />
          </div>
        }
      />
      {hasRenameFailed && <ErrorMessage className="px-4 py-2">{RENAME_FAILED_MESSAGE}</ErrorMessage>}
      {printView}
    </>
  );
}
