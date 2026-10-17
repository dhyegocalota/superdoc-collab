import { authorColorSlot, DocumentRole, RoomMode } from '@superdoc-collab/types';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { SESSION_USER } from '@/testing/opened-document';
import { SuperDocEditor } from './superdoc-editor';

type EditorConfig = {
  user: { color: string };
  colors: string[];
  ui: { toolbar?: { container: HTMLElement } };
  onReady: (payload: { superdoc: unknown }) => void;
};

const { SuperDoc, superdocDestroy } = vi.hoisted(() => {
  const superdocDestroy = vi.fn();
  return {
    superdocDestroy,
    SuperDoc: vi.fn(function SuperDocStub(_config: EditorConfig) {
      return { destroy: superdocDestroy };
    }),
  };
});

vi.mock('superdoc', () => ({ SuperDoc }));
vi.mock('superdoc/style.css', () => ({}));

const AUTHOR_COLORS = ['#2e39b8', '#5a2eb8', '#912eb8', '#b82ea8', '#b82e70', '#b82e39'];

function renderEditor({
  toolbarContainer = null,
  onSuperdocChange = vi.fn(),
}: { toolbarContainer?: HTMLElement | null; onSuperdocChange?: () => void } = {}) {
  render(
    <SuperDocEditor
      onSuperdocChange={onSuperdocChange}
      toolbarContainer={toolbarContainer}
      documentId="doc-1"
      roomMode={RoomMode.Create}
      role={DocumentRole.Editor}
      user={SESSION_USER}
      file={new Blob()}
      isInert={false}
    />,
  );
  const firstCall = SuperDoc.mock.calls.at(0);
  if (!firstCall) throw new Error('SuperDoc was not constructed');
  return { config: firstCall[0], onSuperdocChange };
}

beforeEach(() => AUTHOR_COLORS.forEach((color, index) => document.documentElement.style.setProperty(`--author-${index + 1}`, color)));

afterEach(() => {
  AUTHOR_COLORS.forEach((_color, index) => document.documentElement.style.removeProperty(`--author-${index + 1}`));
  SuperDoc.mockClear();
  superdocDestroy.mockClear();
});

test('passes the current author colour and six palette colours to SuperDoc', () => {
  const { config } = renderEditor();
  expect(config.user.color).toBe(AUTHOR_COLORS[authorColorSlot(SESSION_USER.id) - 1]);
  expect(config.colors).toEqual(AUTHOR_COLORS);
});

test('the page background class is bg-paper and not bg-background', () => {
  renderEditor();
  const editor = screen.getByTestId('document-editor');
  expect(editor.className).toContain('[&_.superdoc-page]:bg-paper');
  expect(editor.className).not.toContain('[&_.superdoc-page]:bg-background');
});

test('hands the toolbar container to SuperDoc', () => {
  const toolbarContainer = document.createElement('div');
  const { config } = renderEditor({ toolbarContainer });
  expect(config.ui.toolbar?.container).toBe(toolbarContainer);
});

test('exposes the instance as state once SuperDoc is ready and clears it on destroy', () => {
  const instance = { destroy: superdocDestroy };
  const onSuperdocChange = vi.fn();
  const { config } = renderEditor({ onSuperdocChange });
  expect(onSuperdocChange).not.toHaveBeenCalled();
  act(() => config.onReady({ superdoc: instance }));
  expect(onSuperdocChange).toHaveBeenLastCalledWith(instance);
  cleanup();
  expect(onSuperdocChange).toHaveBeenLastCalledWith(null);
});
