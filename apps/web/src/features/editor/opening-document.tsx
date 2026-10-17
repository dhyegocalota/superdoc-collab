import { Skeleton } from '@/components/ui/skeleton';
import { LOADING_DOCUMENT_MESSAGE } from './editor-copy';
import { HomeLink } from './home-link';

export function OpeningDocument() {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-2">
        <HomeLink />
        <Skeleton className="h-9 w-full max-w-sm" />
      </header>
      <p role="status" className="p-4 text-sm text-muted-foreground">
        {LOADING_DOCUMENT_MESSAGE}
      </p>
    </div>
  );
}
