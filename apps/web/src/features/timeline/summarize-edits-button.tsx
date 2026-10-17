import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SUMMARIZE_EDITS_LABEL, SUMMARIZING_LABEL } from './timeline-copy';

type SummarizeEditsButtonProps = { isRunning: boolean; onSummarize: () => void };

export function SummarizeEditsButton({ isRunning, onSummarize }: SummarizeEditsButtonProps) {
  return (
    <Button type="button" variant="default" size="sm" disabled={isRunning} aria-busy={isRunning} onClick={onSummarize}>
      <Sparkles aria-hidden />
      {isRunning ? SUMMARIZING_LABEL : SUMMARIZE_EDITS_LABEL}
    </Button>
  );
}
