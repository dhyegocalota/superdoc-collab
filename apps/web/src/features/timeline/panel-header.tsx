import { ChevronDown, ChevronUp, PanelRightClose, PanelRightOpen, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TIMELINE_TOGGLE_LABEL } from '@/features/editor/editor-copy';
import { TimeZoneLabel } from '@/features/settings/time-zone-label';
import { cn } from '@/lib/utils';
import { PanelPositionToggle } from './panel-position-toggle';
import { PanelState } from './panel-layout';
import { TIMELINE_HEADING } from './timeline-copy';
import type { TimelineChange } from './use-timeline-change';
import { PanelPosition, usePanelPosition } from './use-panel-position';

type PanelHeaderProps = {
  position: PanelPosition;
  change: TimelineChange | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

const COLLAPSE_ICONS: Record<PanelPosition, Record<PanelState, LucideIcon>> = {
  [PanelPosition.Bottom]: { [PanelState.Open]: ChevronDown, [PanelState.Collapsed]: ChevronUp },
  [PanelPosition.Side]: { [PanelState.Open]: PanelRightClose, [PanelState.Collapsed]: PanelRightOpen },
};

export function PanelHeader({ position, change: _change, isOpen, onOpenChange }: PanelHeaderProps) {
  const { choosePosition, canChoose } = usePanelPosition();
  const panelState = isOpen ? PanelState.Open : PanelState.Collapsed;
  const CollapseIcon = COLLAPSE_ICONS[position][panelState];
  const isRail = position === PanelPosition.Side && !isOpen;
  return (
    <header className={cn('flex items-center gap-2 p-2', isRail && 'flex-col')}>
      <h2 className={cn('px-2 text-sm font-medium', isRail && 'sr-only')}>{TIMELINE_HEADING}</h2>
      {isOpen && (
        <span className="hidden min-w-0 sm:block">
          <TimeZoneLabel />
        </span>
      )}
      {isOpen && <span className="flex-1" />}
      {isOpen && canChoose && <PanelPositionToggle position={position} onChoose={choosePosition} />}
      <Button variant="ghost" size="icon" aria-label={TIMELINE_TOGGLE_LABEL} aria-expanded={isOpen} onClick={() => onOpenChange(!isOpen)}>
        <CollapseIcon />
      </Button>
    </header>
  );
}
