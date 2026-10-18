import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { SelectedHeader, type SelectedHeaderSelection } from './selected-header';
import { CLEAR_SELECTION_LABEL, SHOWING_WHOLE_DOCUMENT_MESSAGE, VIEW_VERSION_LABEL } from './timeline-copy';

const SELECTION: SelectedHeaderSelection = { rangeLabel: 'Oct 16, 2:00 – 2:01 PM', editCount: 12 };

function renderHeader({
  selection = SELECTION,
  hasVersion = false,
  isPhoneLayout = true,
  onClear = vi.fn(),
  onViewVersion = vi.fn(),
}: Partial<Parameters<typeof SelectedHeader>[0]> = {}) {
  render(
    <SelectedHeader
      selection={selection}
      hasVersion={hasVersion}
      isPhoneLayout={isPhoneLayout}
      onClear={onClear}
      onViewVersion={onViewVersion}
    />,
  );
  return { onClear, onViewVersion };
}

test('a selected bin shows its time range, its edit count and Clear selection', async () => {
  const { onClear } = renderHeader();
  expect(screen.getByText(SELECTION.rangeLabel)).toBeVisible();
  expect(screen.getByText('12 edits')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: CLEAR_SELECTION_LABEL }));
  expect(onClear).toHaveBeenCalledTimes(1);
});

test('no selection reads Showing the whole document and offers no buttons', () => {
  renderHeader({ selection: null });
  expect(screen.getByText(SHOWING_WHOLE_DOCUMENT_MESSAGE)).toBeVisible();
  expect(screen.queryByRole('button')).toBeNull();
});

test('a versioned bin on a phone offers View version', async () => {
  const { onViewVersion } = renderHeader({ hasVersion: true, isPhoneLayout: true });
  await userEvent.click(screen.getByRole('button', { name: VIEW_VERSION_LABEL }));
  expect(onViewVersion).toHaveBeenCalledTimes(1);
});

test('a versioned bin on desktop offers no View version', () => {
  renderHeader({ hasVersion: true, isPhoneLayout: false });
  expect(screen.queryByRole('button', { name: VIEW_VERSION_LABEL })).toBeNull();
});

test('a bin without a version offers no View version', () => {
  renderHeader({ hasVersion: false, isPhoneLayout: true });
  expect(screen.queryByRole('button', { name: VIEW_VERSION_LABEL })).toBeNull();
});

test('the header announces changes politely', () => {
  renderHeader();
  expect(screen.getByText(SELECTION.rangeLabel).closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
});
