import { useState, type RefObject } from 'react';
import { toast } from 'sonner';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { COPY_FAILED_MESSAGE, COPY_LINK_LABEL } from './admin-copy';

type LinkCreatedDialogProps = {
  url: string;
  title: string;
  description: string;
  copiedToast: string;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
};

export function LinkCreatedDialog({ url, title, description, copiedToast, onClose, returnFocusRef }: LinkCreatedDialogProps) {
  const [copyFailed, setCopyFailed] = useState(false);

  async function copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      setCopyFailed(true);
      return;
    }
    setCopyFailed(false);
    toast(copiedToast);
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={url} aria-label={title} onFocus={(event) => event.currentTarget.select()} />
          <Button variant="outline" onClick={copyLink}>
            {COPY_LINK_LABEL}
          </Button>
        </div>
        {copyFailed && <ErrorMessage>{COPY_FAILED_MESSAGE}</ErrorMessage>}
      </DialogContent>
    </Dialog>
  );
}
