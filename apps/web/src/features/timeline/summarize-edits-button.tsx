import { Button } from '@/components/ui/button';
import { SUMMARIZE_EDITS_LABEL } from './timeline-copy';

type SummarizeEditsButtonProps = { disabledReason: string | null; reasonId: string; onSummarize: () => void };

export function SummarizeEditsButton({ disabledReason, reasonId, onSummarize }: SummarizeEditsButtonProps) {
  const isDisabled = disabledReason !== null;
  return (
    <Button type="button" variant="outline" size="sm" disabled={isDisabled} title={isDisabled ? disabledReason : undefined} aria-describedby={isDisabled ? reasonId : undefined} onClick={onSummarize}>
      {SUMMARIZE_EDITS_LABEL}
    </Button>
  );
}
