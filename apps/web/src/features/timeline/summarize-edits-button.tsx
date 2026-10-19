import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip';
import { ShortcutTooltipContent } from '@/features/shortcuts/shortcut-tooltip-content';
import { ShortcutId } from '@/features/shortcuts/shortcuts';
import { SUMMARIZE_EDITS_LABEL, SUMMARIZING_LABEL } from './timeline-copy';

type SummarizeEditsButtonProps = { isRunning: boolean; onSummarize: () => void };

export function SummarizeEditsButton({ isRunning, onSummarize }: SummarizeEditsButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="default" size="sm" disabled={isRunning} aria-busy={isRunning} onClick={onSummarize}>
          <Sparkles aria-hidden />
          {isRunning ? SUMMARIZING_LABEL : SUMMARIZE_EDITS_LABEL}
        </Button>
      </TooltipTrigger>
      <ShortcutTooltipContent label={SUMMARIZE_EDITS_LABEL} shortcutId={ShortcutId.SummarizeEdits} />
    </Tooltip>
  );
}
