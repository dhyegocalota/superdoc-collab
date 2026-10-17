import { Skeleton } from '@/components/ui/skeleton';
import { LOADING_DOCUMENTS_LABEL } from './documents-copy';

const SKELETON_ROWS = 3;

export function DocumentListSkeleton() {
  return (
    <div role="status" aria-label={LOADING_DOCUMENTS_LABEL} className="space-y-2">
      {Array.from({ length: SKELETON_ROWS }, (_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}
