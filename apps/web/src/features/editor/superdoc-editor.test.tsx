import { DocumentRole, RoomMode } from '@superdoc-collab/types';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AUTHOR_PALETTE, installAuthorPalette, removeAuthorPalette } from '@/testing/author-palette';
import { SESSION_USER } from '@/testing/opened-document';
import type { EditorLoadProgress } from '@/features/open-progress/open-progress-view';
import { SuperDocEditor } from './superdoc-editor';

type EditorConfig = {
  user: { color: string };
  colors: string[];
  ui: { toolbar?: { container: HTMLElement } };
  onReady: (payload: { superdoc: unknown }) => void;
  onCollaborationReady: () => void;
  onEditorUpdate: () => void;
  onPaginationUpdate: (payload: { totalPages: number }) => void;
  onCollaborationConnectionChange: (payload: { state: string; kind: string }) => void;
};

const DISPLACED_COLOR_SLOT = 2;

const { SuperDoc, superdocDestroy, useCaretOnOpen } = vi.hoisted(() => {
  const useCaretOnOpen = vi.fn();
  const superdocDestroy = vi.fn();
  return {
    superdocDestroy,
    useCaretOnOpen,
    SuperDoc: vi.fn(function SuperDocStub(_config: EditorConfig) {
      return { destroy: superdocDestroy };
    }),
  };
});

vi.mock('superdoc', () => ({ SuperDoc }));
vi.mock('superdoc/style.css', () => ({}));
vi.mock('./use-caret-on-open', () => ({ useCaretOnOpen }));

function renderEditor({
  toolbarContainer = null,
  onSuperdocChange = vi.fn(),
  onEditorUpdate = vi.fn(),
  onDocumentEdit = vi.fn(),
  onLoadProgress = vi.fn(),
  role = DocumentRole.Editor,
}: {
  toolbarContainer?: HTMLElement | null;
  onSuperdocChange?: () => void;
  onEditorUpdate?: () => void;
  onDocumentEdit?: () => void;
  onLoadProgress?: (progress: EditorLoadProgress) => void;
  role?: DocumentRole;
} = {}) {
  render(
    <SuperDocEditor
      onSuperdocChange={onSuperdocChange}
      onContainerChange={vi.fn()}
      toolbarContainer={toolbarContainer}
      documentId="doc-1"
      roomMode={RoomMode.Create}
      creatorTicket={null}
      role={role}
      user={SESSION_USER}
      colorSlot={DISPLACED_COLOR_SLOT}
      file={new Blob()}
      isInert={false}
      isSuperseded={false}
      onTransportReport={vi.fn()}
      onEditorUpdate={onEditorUpdate}
      onDocumentEdit={onDocumentEdit}
      onLoadProgress={onLoadProgress}
    />,
  );
  const firstCall = SuperDoc.mock.calls.at(0);
  if (!firstCall) throw new Error('SuperDoc was not constructed');
  return { config: firstCall[0], onSuperdocChange };
}

beforeEach(installAuthorPalette);

afterEach(() => {
  removeAuthorPalette();
  SuperDoc.mockClear();
  superdocDestroy.mockClear();
  useCaretOnOpen.mockClear();
});

test('passes the colour of the slot the server assigned and six palette colours to SuperDoc', () => {
  const { config } = renderEditor();
  expect(config.user.color).toBe(AUTHOR_PALETTE[DISPLACED_COLOR_SLOT - 1]);
  expect(config.colors).toEqual(AUTHOR_PALETTE);
});

test('reports every editor update to the page', () => {
  const onEditorUpdate = vi.fn();
  const { config } = renderEditor({ onEditorUpdate });
  config.onEditorUpdate();
  expect(onEditorUpdate).toHaveBeenCalledTimes(1);
});

test('reports a layout pass to the page, which is how a peer’s edit arrives', () => {
  const onEditorUpdate = vi.fn();
  const { config } = renderEditor({ onEditorUpdate });
  config.onPaginationUpdate({ totalPages: 1 });
  expect(onEditorUpdate).toHaveBeenCalledTimes(1);
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

function lastCaretOnOpenEnabled(): boolean {
  return useCaretOnOpen.mock.lastCall![0].isEnabled;
}

test('enables the caret on open for an editor only once collaboration is ready', () => {
  const { config } = renderEditor();
  expect(lastCaretOnOpenEnabled()).toBe(false);
  act(() => config.onCollaborationReady());
  expect(lastCaretOnOpenEnabled()).toBe(true);
});

test('never enables the caret on open for a reader', () => {
  const { config } = renderEditor({ role: DocumentRole.Reader });
  act(() => config.onCollaborationReady());
  expect(lastCaretOnOpenEnabled()).toBe(false);
});

test('reports a document edit only for an editor update, never for a layout pass', () => {
  const onDocumentEdit = vi.fn();
  const { config } = renderEditor({ onDocumentEdit });
  config.onPaginationUpdate({ totalPages: 1 });
  expect(onDocumentEdit).not.toHaveBeenCalled();
  config.onEditorUpdate();
  expect(onDocumentEdit).toHaveBeenCalledTimes(1);
});

test('the editor container keeps a small top padding so the first page clears the toolbar', () => {
  renderEditor();
  expect(screen.getByTestId('document-editor')).toHaveClass('pt-3');
});

test('reports a fresh load, then the sync, then the pages laid out so far', () => {
  const onLoadProgress = vi.fn();
  const { config } = renderEditor({ onLoadProgress });
  expect(onLoadProgress).toHaveBeenLastCalledWith({ isSynced: false, pageCount: 0, hasFailed: false });
  act(() => config.onCollaborationReady());
  expect(onLoadProgress).toHaveBeenLastCalledWith({ isSynced: true, pageCount: 0, hasFailed: false });
  act(() => config.onPaginationUpdate({ totalPages: 12 }));
  expect(onLoadProgress).toHaveBeenLastCalledWith({ isSynced: true, pageCount: 12, hasFailed: false });
});

test('reports a failure before the first sync so the page can drop its panel', () => {
  const onLoadProgress = vi.fn();
  const { config } = renderEditor({ onLoadProgress });
  act(() => config.onCollaborationConnectionChange({ state: 'failed', kind: 'failed' }));
  expect(onLoadProgress).toHaveBeenLastCalledWith({ isSynced: false, pageCount: 0, hasFailed: true });
});
