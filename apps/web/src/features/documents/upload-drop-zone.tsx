import { Upload } from 'lucide-react';
import { useRef, type ChangeEvent } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CHOOSE_FILE_LABEL, DROP_ZONE_LABEL, DROP_ZONE_LIMIT, FILE_INPUT_LABEL } from './documents-copy';
import { UploadProgressStatus } from './upload-progress-status';
import type { DocumentUpload } from './use-upload-document';

const FILE_INPUT_ID = 'drop-zone-file';
const DOCX_ACCEPT = '.docx';

export function UploadDropZone({ upload }: { upload: DocumentUpload }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function onFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.item(0);
    event.target.value = '';
    if (!file) return;
    upload.uploadFiles([file]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed p-8 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Upload aria-hidden className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">{DROP_ZONE_LABEL}</p>
          <p className="text-sm text-muted-foreground">{DROP_ZONE_LIMIT}</p>
        </div>
        <Label htmlFor={FILE_INPUT_ID} className="sr-only">
          {FILE_INPUT_LABEL}
        </Label>
        <Input
          ref={inputRef}
          id={FILE_INPUT_ID}
          type="file"
          accept={DOCX_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          disabled={upload.isPending}
          onChange={onFileChange}
        />
        <Button variant="outline" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
          {CHOOSE_FILE_LABEL}
        </Button>
        {upload.isPending && <UploadProgressStatus progress={upload.progress} />}
      </div>
      {upload.message !== null && <ErrorMessage>{upload.message}</ErrorMessage>}
    </div>
  );
}
