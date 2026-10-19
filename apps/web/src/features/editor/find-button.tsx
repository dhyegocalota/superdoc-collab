import { Search } from 'lucide-react';
import type { SuperDoc } from 'superdoc';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger } from '@/components/ui/tooltip';
import { ShortcutTooltipContent } from '@/features/shortcuts/shortcut-tooltip-content';
import { ShortcutId } from '@/features/shortcuts/shortcuts';
import { FIND_IN_DOCUMENT_LABEL } from './editor-copy';

const SEARCH_OPEN_EVENT = 'search:open';

export function openFindBar(superdoc: SuperDoc | null): void {
  superdoc?.emit(SEARCH_OPEN_EVENT);
}

export function FindButton({ superdoc }: { superdoc: SuperDoc | null }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={FIND_IN_DOCUMENT_LABEL} onClick={() => openFindBar(superdoc)}>
          <Search aria-hidden />
        </Button>
      </TooltipTrigger>
      <ShortcutTooltipContent label={FIND_IN_DOCUMENT_LABEL} shortcutId={ShortcutId.Find} />
    </Tooltip>
  );
}
