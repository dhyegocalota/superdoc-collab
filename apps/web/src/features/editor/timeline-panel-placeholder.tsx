import { TIMELINE_PLACEHOLDER_MESSAGE } from '@superdoc-history/types';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TIMELINE_TOGGLE_LABEL } from './editor-copy';

export function TimelinePanelPlaceholder() {
  const [isOpen, setIsOpen] = useState(true);
  const ToggleIcon = isOpen ? PanelRightClose : PanelRightOpen;

  return (
    <aside className="hidden shrink-0 items-start border-l md:flex">
      {isOpen && <p className="w-64 p-4 text-sm text-muted-foreground">{TIMELINE_PLACEHOLDER_MESSAGE}</p>}
      <Button variant="ghost" size="icon" aria-label={TIMELINE_TOGGLE_LABEL} aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)}>
        <ToggleIcon />
      </Button>
    </aside>
  );
}
