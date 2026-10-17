import { DocumentRole } from '@superdoc-collab/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Input } from '@/components/ui/input';
import { DOCUMENTS_QUERY_KEY } from '@/features/documents/documents-api';
import { KeyboardKey } from '@/lib/keyboard';
import { renameDocument } from './editor-api';
import { RENAME_FAILED_MESSAGE, renameTitleLabel, TITLE_LABEL } from './editor-copy';

const TITLE_TEXT_CLASS = 'h-8 max-w-[360px] min-w-0 truncate px-2 text-left leading-8 font-medium';
const TITLE_BUTTON_CLASS = `${TITLE_TEXT_CLASS} rounded-md hover:bg-accent`;

export function DocumentTitle({ documentId, title, role }: { documentId: string; title: string; role: DocumentRole }) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const titleButtonRef = useRef<HTMLButtonElement>(null);
  const isCancelledRef = useRef(false);
  const shouldRestoreFocusRef = useRef(false);
  const { mutate, isError, isPending, variables } = useMutation({
    mutationFn: renameDocument,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY }),
  });
  const shownTitle = isPending ? variables.title : title;

  useEffect(() => {
    if (isEditing || !shouldRestoreFocusRef.current) return;
    shouldRestoreFocusRef.current = false;
    titleButtonRef.current?.focus();
  }, [isEditing]);

  function startEditing(): void {
    isCancelledRef.current = false;
    setIsEditing(true);
  }

  function finishEditing(event: FocusEvent<HTMLInputElement>): void {
    const nextTitle = event.currentTarget.value.trim();
    setIsEditing(false);
    const isRename = !isCancelledRef.current && nextTitle !== '' && nextTitle !== title;
    if (!isRename) return;
    mutate({ documentId, title: nextTitle });
  }

  function leaveInput(event: KeyboardEvent<HTMLInputElement>): void {
    const isLeavingKey = event.key === KeyboardKey.Enter || event.key === KeyboardKey.Escape;
    if (!isLeavingKey) return;
    event.preventDefault();
    isCancelledRef.current = event.key === KeyboardKey.Escape;
    shouldRestoreFocusRef.current = true;
    event.currentTarget.blur();
  }

  if (role === DocumentRole.Reader) return <h1 className={TITLE_TEXT_CLASS}>{title}</h1>;

  return (
    <>
      {isEditing ? (
        <Input
          autoFocus
          aria-label={TITLE_LABEL}
          defaultValue={shownTitle}
          className="h-8 min-w-0 flex-1 font-medium sm:max-w-sm"
          onFocus={(event) => event.currentTarget.select()}
          onBlur={finishEditing}
          onKeyDown={leaveInput}
        />
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
      {isError && <ErrorMessage>{RENAME_FAILED_MESSAGE}</ErrorMessage>}
    </>
  );
}
