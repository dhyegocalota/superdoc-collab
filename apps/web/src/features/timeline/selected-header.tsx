import type { Ref } from 'react';
import { Button } from '@/components/ui/button';
import { CLEAR_SELECTION_LABEL, countLabel, EditUnit, SHOWING_WHOLE_DOCUMENT_MESSAGE, VIEW_VERSION_LABEL } from './timeline-copy';

export type SelectedHeaderSelection = { rangeLabel: string; volume: number };

type SelectedHeaderProps = {
  ref: Ref<HTMLDivElement>;
  selection: SelectedHeaderSelection | null;
  canViewVersion: boolean;
  isViewVersionDisabled: boolean;
  onClear: () => void;
  onViewVersion: () => void;
};

export function SelectedHeader({ ref, selection, canViewVersion, isViewVersionDisabled, onClear, onViewVersion }: SelectedHeaderProps) {
  return (
    <div
      ref={ref}
      data-selected-header
      aria-live="polite"
      className="sticky top-0 z-10 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border bg-muted px-3 py-1 text-sm"
    >
      {selection === null && <p className="text-muted-foreground">{SHOWING_WHOLE_DOCUMENT_MESSAGE}</p>}
      {selection !== null && (
        <>
          <p className="min-w-0 flex-1 basis-40">
            <span className="font-medium">{selection.rangeLabel}</span>{' '}
            <span className="text-muted-foreground">{countLabel({ count: selection.volume, unit: EditUnit.Character })}</span>
          </p>
          <div className="ml-auto flex items-center gap-1">
            {canViewVersion && (
              <Button type="button" size="touch" disabled={isViewVersionDisabled} onClick={onViewVersion}>
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
