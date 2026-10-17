import type { CreatedInvite } from '@superdoc-collab/types';
import { useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { COPY_FAILED_MESSAGE, COPY_LINK_LABEL, INVITE_COPIED_TOAST, INVITE_CREATED_DESCRIPTION, INVITE_CREATED_TITLE } from './admin-copy';

type InviteCreatedDialogProps = {
  invite: CreatedInvite;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
};

export function InviteCreatedDialog({ invite, onClose, returnFocusRef }: InviteCreatedDialogProps) {
  const [copyFailed, setCopyFailed] = useState(false);

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(invite.url);
    } catch {
      setCopyFailed(true);
      return;
    }
    setCopyFailed(false);
    toast(INVITE_COPIED_TOAST);
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{INVITE_CREATED_TITLE}</DialogTitle>
          <DialogDescription>{INVITE_CREATED_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={invite.url} aria-label={INVITE_CREATED_TITLE} onFocus={(event) => event.currentTarget.select()} />
          <Button variant="outline" onClick={copyLink}>
            {COPY_LINK_LABEL}
          </Button>
        </div>
        {copyFailed && <ErrorMessage>{COPY_FAILED_MESSAGE}</ErrorMessage>}
      </DialogContent>
    </Dialog>
  );
}
