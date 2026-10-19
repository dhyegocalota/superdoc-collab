import { progressValueOf } from '@/features/open-progress/open-progress-panel';
import { uploadingView } from '@/features/open-progress/open-progress-view';
import { Progress } from '@/components/ui/progress';
import type { UploadProgress } from '@/lib/api';
import { UPLOADING_MESSAGE } from './documents-copy';

export function UploadProgressStatus({ progress }: { progress: UploadProgress | null }) {
  const view = progress && uploadingView(progress);
  return (
    <div role="status" data-testid="upload-progress" className="w-full space-y-2">
      <p className="text-sm text-muted-foreground">{UPLOADING_MESSAGE}</p>
      <Progress
        value={view ? progressValueOf(view.fraction) : null}
        aria-label={UPLOADING_MESSAGE}
        aria-valuetext={view ? view.detail : undefined}
      />
      {view && (
        <p data-testid="upload-progress-detail" aria-live="off" className="text-sm text-muted-foreground tabular-nums">
          {view.detail}
        </p>
      )}
    </div>
  );
}
