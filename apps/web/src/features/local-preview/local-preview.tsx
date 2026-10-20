import type { BootstrapProgress } from '@superdoc-collab/types';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { useEffect, useState } from 'react';
import { AppTopBar } from '@/components/app-top-bar';
import { AccountMenu } from '@/features/account/account-menu';
import { LeaveOpeningButton } from '@/features/editor/leave-opening-button';
import { DOCUMENT_SURFACE_CLASS, HIDDEN_LOADING_OVERLAY_CLASS } from '@/features/editor/superdoc-editor';
import { ExceptionOutcome, exceptionOutcome } from '@/features/editor/superdoc-exceptions';
import { previewSuperdocOptions } from '@/features/editor/superdoc-options';
import { FITTED_PAGE_CLASS } from '@/features/editor/superdoc-zoom';
import { EDITOR_OPEN_STAGES } from '@/features/open-progress/open-stage';
import { TickingOpenProgressPanel } from '@/features/open-progress/ticking-open-progress-panel';
import { useHasPaintedParagraph } from '@/features/open-progress/use-has-painted-paragraph';
import { cn } from '@/lib/utils';
import { PREVIEW_BADGE_MESSAGE, PREVIEW_FAILED_MESSAGE } from './local-preview-copy';
import { previewOpenView } from './preview-open-view';

export type LocalPreviewProps = {
  title: string | null;
  file: File;
  bootstrap: BootstrapProgress | null;
  answeredAt: number;
  startedAt: number;
  isProgressShown: boolean;
};

export function LocalPreview({ title, file, bootstrap, answeredAt, startedAt, isProgressShown }: LocalPreviewProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [hasFailed, setHasFailed] = useState(false);
  const hasPaintedParagraph = useHasPaintedParagraph(container);
  const isPanelVisible = isProgressShown && !hasPaintedParagraph && !hasFailed;

  useEffect(() => {
    if (!container) return;
    let isActive = true;
    const superdoc = new SuperDoc({
      ...previewSuperdocOptions({ container, file }),
      onPaginationUpdate: ({ totalPages }) => {
        if (isActive) setPageCount(totalPages);
      },
      onException: (payload) => {
        const isFatal = exceptionOutcome(payload) === ExceptionOutcome.Fatal;
        if (isActive && isFatal) setHasFailed(true);
      },
    });
    return () => {
      isActive = false;
      superdoc.destroy();
    };
  }, [container, file]);

  return (
    <div className="flex h-full flex-col">
      <AppTopBar left={title && <span className="truncate text-sm font-medium">{title}</span>} right={<AccountMenu colorSlot={null} />} />
      <p role="status" className="border-b bg-muted px-4 py-1 text-xs text-muted-foreground">
        {hasFailed ? PREVIEW_FAILED_MESSAGE : PREVIEW_BADGE_MESSAGE}
      </p>
      <div className={cn('relative flex min-h-0 min-w-0 flex-1', HIDDEN_LOADING_OVERLAY_CLASS)}>
        <div ref={setContainer} data-testid="local-preview" className={cn(DOCUMENT_SURFACE_CLASS, FITTED_PAGE_CLASS)} />
        {isPanelVisible && (
          <TickingOpenProgressPanel
            title={title}
            stages={EDITOR_OPEN_STAGES}
            startedAt={startedAt}
            viewAt={(elapsedSeconds) => previewOpenView({ bootstrap, pageCount, elapsedSeconds, startedAt, answeredAt })}
            action={<LeaveOpeningButton />}
          />
        )}
      </div>
    </div>
  );
}
