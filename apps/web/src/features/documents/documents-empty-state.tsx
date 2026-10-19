import { HistoryIllustration } from '@/components/history-illustration';
import { Button } from '@/components/ui/button';
import { EMPTY_STATE_DESCRIPTION, EMPTY_STATE_HEADING, NEW_DOCUMENT_LABEL } from './documents-copy';
import { UploadDropZone } from './upload-drop-zone';
import type { DocumentUpload } from './use-upload-document';

export function DocumentsEmptyState({
  isCreating,
  onCreate,
  upload,
}: {
  isCreating: boolean;
  onCreate: () => void;
  upload: DocumentUpload;
}) {
  return (
    <section className="flex flex-col items-center gap-6 py-4 text-center">
      <HistoryIllustration className="max-w-sm" />
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">{EMPTY_STATE_HEADING}</h2>
        <p className="mx-auto max-w-md text-muted-foreground">{EMPTY_STATE_DESCRIPTION}</p>
      </div>
      <Button size="lg" disabled={isCreating} onClick={onCreate}>
        {NEW_DOCUMENT_LABEL}
      </Button>
      <div className="w-full max-w-lg">
        <UploadDropZone upload={upload} />
      </div>
    </section>
  );
}
