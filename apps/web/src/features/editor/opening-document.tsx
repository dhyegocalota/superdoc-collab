import { AppTopBar } from '@/components/app-top-bar';
import { Skeleton } from '@/components/ui/skeleton';
import { LOADING_DOCUMENT_MESSAGE } from './editor-copy';

export function OpeningDocument() {
  return (
    <div className="flex h-dvh flex-col">
      <AppTopBar left={<Skeleton className="h-8 w-full max-w-sm" />} right={null} />
      <p role="status" className="p-4 text-sm text-muted-foreground">
        {LOADING_DOCUMENT_MESSAGE}
      </p>
    </div>
  );
}
