import { useState, type FormEvent, type RefObject } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ADD_COMMENT_DESCRIPTION,
  ADD_COMMENT_FAILED_MESSAGE,
  ADD_COMMENT_SUBMIT_LABEL,
  ADD_COMMENT_TITLE,
  CANCEL_LABEL,
  COMMENT_TEXT_LABEL,
} from './editor-copy';

type AddCommentDialogProps = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onSubmit: (text: string) => Promise<boolean>;
  returnFocusRef: RefObject<HTMLElement | null>;
};

function AddCommentForm({ onSubmit, onDone }: { onSubmit: (text: string) => Promise<boolean>; onDone: () => void }) {
  const [text, setText] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const isEmpty = text.trim() === '';

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setIsPending(true);
    setHasFailed(false);
    const isAdded = await onSubmit(text.trim());
    setIsPending(false);
    if (isAdded) return onDone();
    setHasFailed(true);
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <textarea
        autoFocus
        aria-label={COMMENT_TEXT_LABEL}
        value={text}
        rows={4}
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onChange={(event) => setText(event.currentTarget.value)}
      />
      {hasFailed && <ErrorMessage>{ADD_COMMENT_FAILED_MESSAGE}</ErrorMessage>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {CANCEL_LABEL}
        </Button>
        <Button type="submit" disabled={isEmpty || isPending}>
          {ADD_COMMENT_SUBMIT_LABEL}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AddCommentDialog({ isOpen, onOpenChange, onSubmit, returnFocusRef }: AddCommentDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{ADD_COMMENT_TITLE}</DialogTitle>
          <DialogDescription>{ADD_COMMENT_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <AddCommentForm onSubmit={onSubmit} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
