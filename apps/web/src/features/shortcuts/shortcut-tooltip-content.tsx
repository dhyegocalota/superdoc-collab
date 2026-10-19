import { TooltipContent } from '@/components/ui/tooltip';
import { ShortcutHint } from './shortcut-hint';
import type { ShortcutId } from './shortcuts';

export function ShortcutTooltipContent({ label, shortcutId }: { label: string; shortcutId: ShortcutId }) {
  return (
    <TooltipContent className="flex items-center gap-2">
      {label}
      <ShortcutHint shortcutId={shortcutId} />
    </TooltipContent>
  );
}
