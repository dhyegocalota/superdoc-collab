import { DocumentRole } from '@superdoc-collab/types';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { SUMMARIZE_EDITS_LABEL, SUMMARIZING_LABEL } from '@/features/timeline/timeline-copy';
import { ACCENT_COLOR_LABEL, EDITOR_THEME_PRESET_LABELS, THEME_LABEL } from './editor-copy';
import { EditorThemePreset, PRESET_ACCENTS } from './editor-theme';
import { EditorToolbarRow } from './editor-toolbar-row';

const TOOLBAR_CONTAINER_TEST_ID = 'toolbar-container';
const CUSTOM_ACCENT = '#336699';

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('sd-theme-editor');
});

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

test('the row is absent for a reader', () => {
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
  expect(screen.getByTestId(TOOLBAR_CONTAINER_TEST_ID)).toBeInTheDocument();
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
  expect(screen.queryByRole('button', { name: THEME_LABEL })).toBeNull();
});

test('a failed connection makes the whole row inert, Summarize included', () => {
  renderRow({ isToolbarInert: true, isRowInert: true });
  expect(screen.getByTestId('editor-toolbar-row')).toHaveAttribute('inert');
});

test('a past version keeps the row itself live', () => {
  renderRow({ isToolbarInert: true });
  expect(screen.getByTestId('editor-toolbar-row')).not.toHaveAttribute('inert');
});

test('the Theme button opens the five presets and the accent picker, and a preset applies', async () => {
  renderRow();
  await userEvent.click(screen.getByRole('button', { name: THEME_LABEL }));
  Object.values(EditorThemePreset).forEach((preset) => {
    expect(screen.getByRole('radio', { name: EDITOR_THEME_PRESET_LABELS[preset] })).toBeInTheDocument();
  });
  expect(screen.getByLabelText(ACCENT_COLOR_LABEL)).toHaveAttribute('type', 'color');
  expect(screen.getByRole('radio', { name: EDITOR_THEME_PRESET_LABELS[EditorThemePreset.Default] })).toBeChecked();
  await userEvent.click(screen.getByRole('radio', { name: EDITOR_THEME_PRESET_LABELS[EditorThemePreset.Ocean] }));
  expect(screen.getByRole('radio', { name: EDITOR_THEME_PRESET_LABELS[EditorThemePreset.Ocean] })).toBeChecked();
  expect(screen.getByLabelText(ACCENT_COLOR_LABEL)).toHaveValue(PRESET_ACCENTS[EditorThemePreset.Ocean].light);
});

test('picking an accent colour unchecks every preset and applies the colour', () => {
  renderRow();
  fireEvent.click(screen.getByRole('button', { name: THEME_LABEL }));
  fireEvent.input(screen.getByLabelText(ACCENT_COLOR_LABEL), { target: { value: CUSTOM_ACCENT } });
  expect(screen.getByLabelText(ACCENT_COLOR_LABEL)).toHaveValue(CUSTOM_ACCENT);
  expect(screen.queryAllByRole('radio', { checked: true })).toHaveLength(0);
  expect(document.documentElement).toHaveClass('sd-theme-editor');
});
