import { useState, type ChangeEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FILE_INPUT_LABEL, UPLOAD_DIALOG_DESCRIPTION, UPLOAD_DIALOG_TITLE, UPLOAD_LABEL } from './documents-copy';
import { UploadProgressStatus } from './upload-progress-status';
import { useUploadDocument } from './use-upload-document';

const FILE_INPUT_ID = 'document-file';
const DOCX_ACCEPT = '.docx';

export function UploadDialog() {
  const [isOpen, setIsOpen] = useState(false);
  const { uploadFiles, clear, message, isPending, progress } = useUploadDocument({ onUploaded: () => setIsOpen(false) });

  function onOpenChange(nextIsOpen: boolean): void {
    setIsOpen(nextIsOpen);
    clear();
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.item(0);
    event.target.value = '';
    if (!file) return;
    uploadFiles([file]);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>{UPLOAD_LABEL}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{UPLOAD_DIALOG_TITLE}</DialogTitle>
          <DialogDescription>{UPLOAD_DIALOG_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <Label htmlFor={FILE_INPUT_ID}>{FILE_INPUT_LABEL}</Label>
        <Input id={FILE_INPUT_ID} type="file" accept={DOCX_ACCEPT} disabled={isPending} onChange={onFileChange} />
        {isPending && <UploadProgressStatus progress={progress} />}
        {message !== null && <ErrorMessage>{message}</ErrorMessage>}
      </DialogContent>
    </Dialog>
  );
}
