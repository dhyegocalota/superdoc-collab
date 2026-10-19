import { DocumentRole, isBlank, type OpenedDocument } from '@superdoc-collab/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ShortcutTooltipContent } from '@/features/shortcuts/shortcut-tooltip-content';
import { ShortcutId } from '@/features/shortcuts/shortcuts';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { KeyboardKey } from '@/lib/keyboard';
import { openedDocumentQueryKey, renameDocument } from './editor-api';
import { CANCEL_TITLE_LABEL, renameTitleLabel, SAVE_TITLE_DISABLED_REASON, SAVE_TITLE_LABEL, TITLE_LABEL } from './editor-copy';

const TITLE_TEXT_CLASS = 'h-8 max-w-[360px] min-w-20 truncate md:min-w-24 px-2 text-left leading-8 font-medium';
const ACTION_ICON_CLASS = 'size-4';
const TITLE_BUTTON_CLASS = `${TITLE_TEXT_CLASS} rounded-md hover:bg-accent`;

type DocumentTitleProps = {
  documentId: string;
  title: string;
  role: DocumentRole;
  onFailureChange: (hasFailed: boolean) => void;
  onDirtyChange: (isDirty: boolean) => void;
  onEditingChange: (isEditing: boolean) => void;
};

export function DocumentTitle({ documentId, title, role, onFailureChange, onDirtyChange, onEditingChange }: DocumentTitleProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const titleButtonRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState('');
  const reasonId = useId();
  const shouldRestoreFocusRef = useRef(false);
  const { mutate, isPending, variables } = useMutation({
    mutationFn: renameDocument,
    onMutate: () => onFailureChange(false),
    onError: () => onFailureChange(true),
    onSuccess: (_, { title: renamedTitle }) => {
      queryClient.setQueryData<OpenedDocument>(
        openedDocumentQueryKey(documentId),
        (opened) => opened && { ...opened, document: { ...opened.document, title: renamedTitle } },
      );
      return queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY, exact: true });
    },
  });
  const shownTitle = isPending ? variables.title : title;

  useEffect(() => {
    if (isEditing || !shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    titleButtonRef.current?.focus();
  }, [isEditing]);

  const nextTitle = draft.trim();
  const isSaveDisabled = isBlank(nextTitle) || nextTitle === title || isPending;
  const isDirty = isEditing && nextTitle !== title;

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);
  useEffect(() => onEditingChange(isEditing), [isEditing, onEditingChange]);

  function startEditing(): void {
    setDraft(shownTitle);
    setIsEditing(true);
  }

  function stopEditing(): void {
    shouldRestoreFocusRef.current = true;
    setIsEditing(false);
  }

  function save(): void {
    stopEditing();
    if (isSaveDisabled) return;
    mutate({ documentId, title: nextTitle });
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    save();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const isSaveKey = event.key === KeyboardKey.Enter;
    const isCancelKey = event.key === KeyboardKey.Escape;
    if (!isSaveKey && !isCancelKey) return;
    event.preventDefault();
    if (isSaveKey) return save();
    stopEditing();
  }

  if (role === DocumentRole.Reader) return <h1 className={TITLE_TEXT_CLASS}>{title}</h1>;

  return (
    <>
      {isEditing ? (
        <form className="flex min-w-0 flex-1 items-center gap-1.5 sm:max-w-md" onSubmit={submit}>
          <Input
            autoFocus
            aria-label={TITLE_LABEL}
            value={draft}
            className="h-8 min-w-0 flex-1 font-medium"
            onChange={(event) => setDraft(event.currentTarget.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={handleKeyDown}
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0">
                <Button
                  type="submit"
                  size="icon-sm"
                  aria-label={SAVE_TITLE_LABEL}
                  aria-busy={isPending}
                  disabled={isSaveDisabled}
                  aria-describedby={isSaveDisabled ? reasonId : undefined}
                >
                  <Check aria-hidden className={ACTION_ICON_CLASS} />
                </Button>
              </span>
            </TooltipTrigger>
            {isSaveDisabled ? (
              <TooltipContent>{SAVE_TITLE_DISABLED_REASON}</TooltipContent>
            ) : (
              <ShortcutTooltipContent label={SAVE_TITLE_LABEL} shortcutId={ShortcutId.SaveTitle} />
            )}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" size="icon-sm" variant="outline" aria-label={CANCEL_TITLE_LABEL} onClick={stopEditing}>
                <X aria-hidden className={ACTION_ICON_CLASS} />
              </Button>
            </TooltipTrigger>
            <ShortcutTooltipContent label={CANCEL_TITLE_LABEL} shortcutId={ShortcutId.CancelTitle} />
          </Tooltip>
          {isSaveDisabled && (
            <p id={reasonId} className="sr-only">
              {SAVE_TITLE_DISABLED_REASON}
            </p>
          )}
        </form>
      ) : (
        <button
          ref={titleButtonRef}
          type="button"
          aria-label={renameTitleLabel(shownTitle)}
          className={TITLE_BUTTON_CLASS}
          onClick={startEditing}
        >
          {shownTitle}
        </button>
      )}
    </>
  );
}
