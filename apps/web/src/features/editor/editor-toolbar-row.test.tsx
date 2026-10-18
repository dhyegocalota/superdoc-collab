import { DocumentRole } from '@superdoc-collab/types';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { SUMMARIZE_EDITS_LABEL, SUMMARIZING_LABEL } from '@/features/timeline/timeline-copy';
import { EditorToolbarRow } from './editor-toolbar-row';

const TOOLBAR_CONTAINER_TEST_ID = 'toolbar-container';

function renderRow({
  role = DocumentRole.Editor,
  isToolbarInert = false,
  isRowInert = false,
  isRunning = false,
  onSummarize = vi.fn(),
} = {}) {
  const containerRef = vi.fn();
  render(
    <EditorToolbarRow
      role={role}
      containerRef={containerRef}
      isToolbarInert={isToolbarInert}
      isRowInert={isRowInert}
      isRunning={isRunning}
      onSummarize={onSummarize}
    />,
  );
  return { containerRef, onSummarize };
}

test('renders the toolbar container, and Summarize edits sits at the right', async () => {
  const { containerRef, onSummarize } = renderRow();
  const container = screen.getByTestId(TOOLBAR_CONTAINER_TEST_ID);
  const summarize = screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL });
  expect(containerRef).toHaveBeenCalledWith(container);
  expect(container.compareDocumentPosition(summarize) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(container.contains(summarize)).toBe(false);
  await userEvent.click(summarize);
  expect(onSummarize).toHaveBeenCalledTimes(1);
});

test('the toolbar container is inert while a past version shows and the Summarize button stays live', async () => {
  const { onSummarize } = renderRow({ isToolbarInert: true });
  expect(screen.getByTestId(TOOLBAR_CONTAINER_TEST_ID)).toHaveAttribute('inert');
  await userEvent.click(screen.getByRole('button', { name: SUMMARIZE_EDITS_LABEL }));
  expect(onSummarize).toHaveBeenCalledTimes(1);
});

test('a running summary shows its label and disables the button', () => {
  renderRow({ isRunning: true });
  expect(screen.getByRole('button', { name: SUMMARIZING_LABEL })).toBeDisabled();
});

test('the row is h-10 and is absent for a reader', () => {
  const { rerender } = render(
    <EditorToolbarRow
      role={DocumentRole.Owner}
      containerRef={vi.fn()}
      isToolbarInert={false}
      isRowInert={false}
      isRunning={false}
      onSummarize={vi.fn()}
    />,
  );
  expect(screen.getByTestId(TOOLBAR_CONTAINER_TEST_ID).parentElement).toHaveClass('h-10');
  rerender(
    <EditorToolbarRow
      role={DocumentRole.Reader}
      containerRef={vi.fn()}
      isToolbarInert={false}
      isRowInert={false}
      isRunning={false}
      onSummarize={vi.fn()}
    />,
  );
  expect(screen.queryByTestId(TOOLBAR_CONTAINER_TEST_ID)).toBeNull();
  expect(screen.queryByRole('button', { name: SUMMARIZE_EDITS_LABEL })).toBeNull();
});

test('a failed connection makes the whole row inert, Summarize included', () => {
  renderRow({ isToolbarInert: true, isRowInert: true });
  expect(screen.getByTestId('editor-toolbar-row')).toHaveAttribute('inert');
});

test('a past version keeps the row itself live', () => {
  renderRow({ isToolbarInert: true });
  expect(screen.getByTestId('editor-toolbar-row')).not.toHaveAttribute('inert');
});

test('the row clips horizontal overflow so a toolbar that is still laying out never scrolls the page', () => {
  renderRow();
  expect(screen.getByTestId('editor-toolbar-row')).toHaveClass('overflow-x-clip');
  expect(screen.getByTestId('toolbar-container')).toHaveClass('overflow-x-clip');
});
