import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { TIMELINE_TOGGLE_LABEL } from '@/features/editor/editor-copy';
import { renderWithProviders } from '@/testing/render-with-providers';
import { PanelHeader } from './panel-header';
import { PanelPosition } from './use-panel-position';

test.each([true, false])('the collapse control tooltip carries the Ctrl+Alt+E hint when open is %s', async (isOpen) => {
  renderWithProviders(<PanelHeader position={PanelPosition.Bottom} change={null} isOpen={isOpen} onOpenChange={vi.fn()} />);
  await userEvent.hover(screen.getByRole('button', { name: TIMELINE_TOGGLE_LABEL }));
  const tooltip = await screen.findByRole('tooltip');
  expect([...tooltip.querySelectorAll('kbd')].map((pill) => pill.textContent)).toEqual(['Ctrl', 'Alt', 'E']);
});
