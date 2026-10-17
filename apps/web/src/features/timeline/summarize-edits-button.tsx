import { Button } from '@/components/ui/button';
import { SUMMARIZE_EDITS_LABEL } from './timeline-copy';

export function SummarizeEditsButton({ disabledReason, onSummarize }: { disabledReason: string | null; onSummarize: () => void }) {
  const isDisabled = disabledReason !== null;
  return (
    <Button type="button" variant="outline" size="sm" disabled={isDisabled} title={isDisabled ? disabledReason : undefined} onClick={onSummarize}>
      {SUMMARIZE_EDITS_LABEL}
    </Button>
  );
}
