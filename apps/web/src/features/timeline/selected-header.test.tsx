import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { SelectedHeader, type SelectedHeaderSelection } from './selected-header';
import { CLEAR_SELECTION_LABEL, SHOWING_WHOLE_DOCUMENT_MESSAGE, VIEW_VERSION_LABEL } from './timeline-copy';

const SELECTION: SelectedHeaderSelection = { rangeLabel: 'Oct 16, 2:00 – 2:01 PM', volume: 12 };

function renderHeader({
  selection = SELECTION,
  canViewVersion = false,
  isViewVersionDisabled = false,
  onClear = vi.fn(),
  onViewVersion = vi.fn(),
}: Partial<Parameters<typeof SelectedHeader>[0]> = {}) {
  render(
    <SelectedHeader
      ref={null}
      selection={selection}
      canViewVersion={canViewVersion}
      isViewVersionDisabled={isViewVersionDisabled}
      onClear={onClear}
      onViewVersion={onViewVersion}
    />,
  );
  return { onClear, onViewVersion };
}

test('a selected bin shows its time range, its edit count and Clear selection', async () => {
  const { onClear } = renderHeader();
  expect(screen.getByText(SELECTION.rangeLabel)).toBeVisible();
  expect(screen.getByText('12 characters')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: CLEAR_SELECTION_LABEL }));
  expect(onClear).toHaveBeenCalledTimes(1);
});

test('no selection reads Showing the whole document and offers no buttons', () => {
  renderHeader({ selection: null });
  expect(screen.getByText(SHOWING_WHOLE_DOCUMENT_MESSAGE)).toBeVisible();
  expect(screen.queryByRole('button')).toBeNull();
});

test('a bin that can be viewed offers View version', async () => {
  const { onViewVersion } = renderHeader({ canViewVersion: true });
  await userEvent.click(screen.getByRole('button', { name: VIEW_VERSION_LABEL }));
  expect(onViewVersion).toHaveBeenCalledTimes(1);
});

test('a bin that cannot be viewed offers no View version', () => {
  renderHeader({ canViewVersion: false });
  expect(screen.queryByRole('button', { name: VIEW_VERSION_LABEL })).toBeNull();
});

test('View version is disabled while a version loads', () => {
  renderHeader({ canViewVersion: true, isViewVersionDisabled: true });
  expect(screen.getByRole('button', { name: VIEW_VERSION_LABEL })).toBeDisabled();
});

test('the header root carries the selected header marker', () => {
  renderHeader();
  expect(screen.getByText(SELECTION.rangeLabel).closest('[aria-live]')).toHaveAttribute('data-selected-header');
});

test('the range text keeps a readable column and the buttons wrap onto their own row when the width is short', () => {
  renderHeader({ canViewVersion: true });
  const text = screen.getByText(SELECTION.rangeLabel).closest('p')!;
  const buttons = screen.getByRole('button', { name: CLEAR_SELECTION_LABEL }).parentElement!;
  const header = text.parentElement!;
  expect(header).toHaveClass('sticky', 'top-0', 'flex-wrap');
  expect(text).toHaveClass('min-w-0', 'flex-1', 'basis-40');
  expect(buttons).toHaveClass('ml-auto');
  expect(buttons).not.toHaveClass('shrink-0');
});

test('the header announces changes politely', () => {
  renderHeader();
  expect(screen.getByText(SELECTION.rangeLabel).closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
});
