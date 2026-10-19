import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { PANEL_EMPTY_STATE_TEST_ID, PanelEmptyState } from './panel-empty-state';
import { EMPTY_PANEL_DESCRIPTION } from './timeline-copy';

test('on a phone the illustration is hidden and the description is clamped to two lines', () => {
  render(<PanelEmptyState />);
  const illustration = screen.getByTestId(PANEL_EMPTY_STATE_TEST_ID).querySelector('svg');
  expect(illustration).toHaveClass('hidden', 'sm:block');
  expect(screen.getByText(EMPTY_PANEL_DESCRIPTION)).toHaveClass('line-clamp-2');
});
