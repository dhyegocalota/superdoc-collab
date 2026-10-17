import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { SUMMARIZE_EDITS_LABEL } from './timeline-copy';

export function SummarizeEditsButton({ disabledReason, onSummarize }: { disabledReason: string | null; onSummarize: () => void }) {
  const reasonId = useId();
  const isDisabled = disabledReason !== null;
  return (
    <div className="flex items-center gap-2">
      {isDisabled && <span id={reasonId} className="text-xs text-muted-foreground">{disabledReason}</span>}
      <Button type="button" variant="outline" size="sm" disabled={isDisabled} title={isDisabled ? disabledReason : undefined} aria-describedby={isDisabled ? reasonId : undefined} onClick={onSummarize}>
        {SUMMARIZE_EDITS_LABEL}
      </Button>
    </div>
  );
}
