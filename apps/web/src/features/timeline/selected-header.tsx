import type { Ref } from 'react';
import { Button } from '@/components/ui/button';
import { CLEAR_SELECTION_LABEL, selectedEditCount, SHOWING_WHOLE_DOCUMENT_MESSAGE, VIEW_VERSION_LABEL } from './timeline-copy';

export type SelectedHeaderSelection = { rangeLabel: string; editCount: number };

type SelectedHeaderProps = {
  ref: Ref<HTMLDivElement>;
  selection: SelectedHeaderSelection | null;
  hasVersion?: boolean;
  isPhoneLayout?: boolean;
  canViewVersion?: boolean;
  isViewVersionDisabled?: boolean;
  onClear: () => void;
  onViewVersion: () => void;
};

export function SelectedHeader({ ref, selection, hasVersion, isPhoneLayout, onClear, onViewVersion }: SelectedHeaderProps) {
  const canViewVersion = selection !== null && hasVersion && isPhoneLayout;
  return (
    <div
      ref={ref}
      aria-live="polite"
      className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-md border bg-muted px-3 py-1 text-sm"
    >
      {selection === null && <p className="text-muted-foreground">{SHOWING_WHOLE_DOCUMENT_MESSAGE}</p>}
      {selection !== null && (
        <>
          <p className="min-w-0">
            <span className="font-medium">{selection.rangeLabel}</span>{' '}
            <span className="text-muted-foreground">{selectedEditCount(selection.editCount)}</span>
          </p>
          <div className="flex shrink-0 items-center gap-1">
            {canViewVersion && (
              <Button type="button" size="touch" onClick={onViewVersion}>
                {VIEW_VERSION_LABEL}
              </Button>
            )}
            <Button type="button" variant="ghost" size="touch" onClick={onClear}>
              {CLEAR_SELECTION_LABEL}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
