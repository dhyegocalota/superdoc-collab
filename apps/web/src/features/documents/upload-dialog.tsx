import { documentPagePath } from '@superdoc-history/types';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DOCUMENTS_QUERY_KEY, uploadDocument, validateUpload } from './documents-api';
import { FILE_INPUT_LABEL, UPLOAD_DIALOG_DESCRIPTION, UPLOAD_DIALOG_TITLE, UPLOAD_LABEL } from './documents-copy';

const FILE_INPUT_ID = 'document-file';
const DOCX_ACCEPT = '.docx';

export function UploadDialog() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const { mutate, error, reset } = useMutation({
    mutationFn: uploadDocument,
    onSuccess: async (document) => {
      await queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
      setIsOpen(false);
      await navigate(documentPagePath(document.id));
    },
  });
  const message = validationMessage || error?.message;

  function onOpenChange(nextIsOpen: boolean): void {
    setIsOpen(nextIsOpen);
    setValidationMessage(null);
    reset();
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.item(0);
    event.target.value = '';
    if (!file) return;
    reset();
    const invalidMessage = validateUpload(file);
    setValidationMessage(invalidMessage);
    if (invalidMessage) return;
    mutate(file);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">{UPLOAD_LABEL}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{UPLOAD_DIALOG_TITLE}</DialogTitle>
          <DialogDescription>{UPLOAD_DIALOG_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <Label htmlFor={FILE_INPUT_ID}>{FILE_INPUT_LABEL}</Label>
        <Input id={FILE_INPUT_ID} type="file" accept={DOCX_ACCEPT} onChange={onFileChange} />
        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
