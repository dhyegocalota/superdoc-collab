import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { PanelPositionToggle } from './panel-position-toggle';
import { PANEL_POSITION_LABEL, PANEL_POSITION_LABELS } from './timeline-copy';
import { PanelPosition } from './use-panel-position';

test('two items, arrow keys move, Enter stores the choice', async () => {
  const onChoose = vi.fn();
  const user = userEvent.setup();
  render(<PanelPositionToggle position={PanelPosition.Bottom} onChoose={onChoose} />);
  expect(screen.getByRole('radiogroup', { name: PANEL_POSITION_LABEL })).toBeInTheDocument();
  const bottom = screen.getByRole('radio', { name: PANEL_POSITION_LABELS[PanelPosition.Bottom] });
  const side = screen.getByRole('radio', { name: PANEL_POSITION_LABELS[PanelPosition.Side] });
  expect(screen.getAllByRole('radio')).toHaveLength(2);
  expect(bottom).toBeChecked();
  await user.tab();
  expect(bottom).toHaveFocus();
  await user.keyboard('{ArrowRight}');
  expect(side).toHaveFocus();
  expect(onChoose).not.toHaveBeenCalled();
  await user.keyboard('{Enter}');
  expect(onChoose).toHaveBeenCalledExactlyOnceWith(PanelPosition.Side);
});

test('pressing the chosen item again does not clear the choice', async () => {
  const onChoose = vi.fn();
  const user = userEvent.setup();
  render(<PanelPositionToggle position={PanelPosition.Side} onChoose={onChoose} />);
  await user.click(screen.getByRole('radio', { name: PANEL_POSITION_LABELS[PanelPosition.Side] }));
  expect(onChoose).not.toHaveBeenCalled();
});
