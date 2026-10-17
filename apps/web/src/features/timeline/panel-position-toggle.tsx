import { PanelBottom, PanelRight } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { PANEL_POSITION_LABEL, PANEL_POSITION_LABELS } from './timeline-copy';
import { isPanelPosition, PanelPosition } from './use-panel-position';

const POSITION_ICONS: Record<PanelPosition, typeof PanelBottom> = {
  [PanelPosition.Bottom]: PanelBottom,
  [PanelPosition.Side]: PanelRight,
};

export function PanelPositionToggle({ position, onChoose }: { position: PanelPosition; onChoose: (position: PanelPosition) => void }) {
  function handleValueChange(value: string): void {
    if (!isPanelPosition(value)) return;
    onChoose(value);
  }

  return (
    <ToggleGroup type="single" value={position} aria-label={PANEL_POSITION_LABEL} onValueChange={handleValueChange}>
      {Object.values(PanelPosition).map((candidate) => {
        const Icon = POSITION_ICONS[candidate];
        return (
          <ToggleGroupItem key={candidate} value={candidate} aria-label={PANEL_POSITION_LABELS[candidate]}>
            <Icon />
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}
