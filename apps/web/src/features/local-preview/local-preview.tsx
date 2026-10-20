import type { BootstrapProgress } from '@superdoc-collab/types';
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';
import { useEffect, useRef, useState } from 'react';
import { AppTopBar } from '@/components/app-top-bar';
import { AccountMenu } from '@/features/account/account-menu';
import { LeaveOpeningButton } from '@/features/editor/leave-opening-button';
import { DOCUMENT_SURFACE_CLASS, HIDDEN_LOADING_OVERLAY_CLASS } from '@/features/editor/superdoc-editor';
import { ExceptionOutcome, exceptionOutcome } from '@/features/editor/superdoc-exceptions';
import { previewSuperdocOptions } from '@/features/editor/superdoc-options';
import { FITTED_PAGE_CLASS } from '@/features/editor/superdoc-zoom';
import { EDITOR_OPEN_STAGES } from '@/features/open-progress/open-stage';
import { TickingOpenProgressPanel, type OpenProgressViewAt } from '@/features/open-progress/ticking-open-progress-panel';
import { cn } from '@/lib/utils';
import { PREVIEW_FAILED_MESSAGE } from './local-preview-copy';
import { previewOpenView } from './preview-open-view';
import { scrollFractionOf } from './scroll-fraction';

const SWAPPING_CLASS = 'fixed inset-0 z-50 bg-background';

export type LocalPreviewProps = {
  title: string | null;
  file: File;
  bootstrap: BootstrapProgress | null;
  answeredAt: number;
  startedAt: number;
  isProgressShown: boolean;
  isSwapping: boolean;
  isFrozen: boolean;
  swappingViewAt: OpenProgressViewAt;
  onScrollFraction: (fraction: number) => void;
};

export function LocalPreview({
  title,
  file,
  bootstrap,
  answeredAt,
  startedAt,
  isProgressShown,
  isSwapping,
  isFrozen,
  swappingViewAt,
  onScrollFraction,
}: LocalPreviewProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [hasFailed, setHasFailed] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const isPanelVisible = isProgressShown && !hasFailed;

  const freezeSurface = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!container) return;
    let isActive = true;
    let isDestroyed = false;
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
    freezeSurface.current = () => {
      if (isDestroyed) return;
      isDestroyed = true;
      const paintedPages = container.cloneNode(true);
      superdoc.destroy();
      container.replaceChildren(...paintedPages.childNodes);
    };
    return () => {
      isActive = false;
      freezeSurface.current = null;
      if (!isDestroyed) superdoc.destroy();
    };
  }, [container, file]);

  useEffect(() => {
    if (isSwapping && freezeSurface.current) freezeSurface.current();
  }, [isSwapping, container]);

  return (
    <div className={cn('flex flex-col', isSwapping ? SWAPPING_CLASS : 'h-full')}>
      <AppTopBar left={title && <span className="truncate text-sm font-medium">{title}</span>} right={<AccountMenu colorSlot={null} />} />
      {hasFailed && (
        <p role="status" className="border-b bg-muted px-4 py-1 text-xs text-muted-foreground">
          {PREVIEW_FAILED_MESSAGE}
        </p>
      )}
      <div className={cn('relative flex min-h-0 min-w-0 flex-1', HIDDEN_LOADING_OVERLAY_CLASS)}>
        <div
          ref={setContainer}
          data-testid="local-preview"
          className={cn(DOCUMENT_SURFACE_CLASS, FITTED_PAGE_CLASS)}
          onScroll={(event) => onScrollFraction(scrollFractionOf(event.currentTarget))}
        />
        {isPanelVisible && (
          <TickingOpenProgressPanel
            title={title}
            stages={EDITOR_OPEN_STAGES}
            startedAt={startedAt}
            isTranslucent
            minimization={pageCount > 0 ? { isMinimized, onMinimizedChange: setIsMinimized } : undefined}
            viewAt={
              isSwapping
                ? swappingViewAt
                : (elapsedSeconds) => previewOpenView({ bootstrap, pageCount, elapsedSeconds, startedAt, answeredAt })
            }
            action={<LeaveOpeningButton />}
          />
        )}
      </div>
    </div>
  );
}
