import { renderHook } from '@testing-library/react';
import type { SuperDoc } from 'superdoc';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DownloadFormat } from '@/features/editor/download-format';
import { superdocStub } from '@/testing/superdoc-stub';
import { useShortcuts } from './use-shortcuts';

type KeyOptions = KeyboardEventInit & { target?: HTMLElement };

const onDownload = vi.fn();
const onShowShortcuts = vi.fn();
const onToggleEditsPanel = vi.fn();
const onSummarize = vi.fn();
const onAddComment = vi.fn();
const setZoom = vi.fn();
const scrollToComment = vi.fn();
const COMMENT_IDS = ['first', 'second', 'third'];
const setDocumentMode = vi.fn();
const insertFootnote = vi.fn();
let hasActiveEditor: boolean;
let documentMode: string | null;
let zoomValue: number;
const execute = vi.fn();
let commandState: { enabled: boolean; supported: boolean; value?: string };
let requestedCommandIds: string[];

function superdocWithCommands(): SuperDoc {
  const get = vi.fn((commandId: string) => {
    requestedCommandIds.push(commandId);
    return { getState: () => commandState, execute };
  });
  return superdocStub({
    activeEditor: hasActiveEditor ? { doc: { footnotes: { insert: insertFootnote } } } : null,
    ui: {
      commands: { get },
      zoom: { getSnapshot: () => ({ value: zoomValue, min: 25, max: 500 }), set: setZoom },
      document: { getSnapshot: () => ({ mode: documentMode }), setMode: setDocumentMode },
      comments: { list: () => COMMENT_IDS.map((id) => ({ id })), scrollTo: scrollToComment },
    },
  });
}

function pressKey({ target = document.body, ...init }: KeyOptions): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function renderShortcuts({ superdoc = superdocWithCommands(), canEdit = true }: { superdoc?: SuperDoc | null; canEdit?: boolean } = {}) {
  return renderHook(() => useShortcuts({ superdoc, canEdit, onDownload, onShowShortcuts, onToggleEditsPanel, onSummarize, onAddComment }));
}

function appendField(tagName: 'input' | 'textarea', value: string): HTMLElement {
  const field = document.createElement(tagName);
  field.value = value;
  document.body.append(field);
  return field;
}

beforeEach(() => {
  commandState = { enabled: true, supported: true };
  requestedCommandIds = [];
  zoomValue = 100;
  documentMode = 'editing';
  hasActiveEditor = true;
  onAddComment.mockReturnValue(true);
  vi.stubGlobal('navigator', { platform: 'Win32' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  vi.clearAllMocks();
});

test('Ctrl and a command key run the catalogued command and consume the key', () => {
  renderShortcuts();
  const event = pressKey({ code: 'KeyL', key: 'l', ctrlKey: true });
  expect(requestedCommandIds).toEqual(['text-align']);
  expect(execute).toHaveBeenCalledWith('left');
  expect(event.defaultPrevented).toBe(true);
});

test('on a Mac the Command key is the modifier and Control is not', () => {
  vi.stubGlobal('navigator', { platform: 'MacIntel' });
  renderShortcuts();
  expect(pressKey({ code: 'KeyE', key: 'e', ctrlKey: true }).defaultPrevented).toBe(false);
  expect(execute).not.toHaveBeenCalled();
  expect(pressKey({ code: 'KeyE', key: 'e', metaKey: true }).defaultPrevented).toBe(true);
  expect(execute).toHaveBeenCalledWith('center');
});

test('a key with an extra modifier does not match a shorter combination', () => {
  renderShortcuts();
  expect(pressKey({ code: 'KeyL', key: 'L', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
  expect(pressKey({ code: 'KeyL', key: 'l', ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
  expect(execute).not.toHaveBeenCalled();
});

test('a key SuperDoc already consumed is left alone', () => {
  renderShortcuts();
  const event = new KeyboardEvent('keydown', { code: 'KeyL', key: 'l', ctrlKey: true, bubbles: true, cancelable: true });
  event.preventDefault();
  document.body.dispatchEvent(event);
  expect(execute).not.toHaveBeenCalled();
});

test('a native entry is never intercepted', () => {
  renderShortcuts();
  const event = pressKey({ code: 'KeyB', key: 'b', ctrlKey: true });
  expect(event.defaultPrevented).toBe(false);
  expect(requestedCommandIds).toEqual([]);
  expect(execute).not.toHaveBeenCalled();
});

test('a key that is not in the registry is not consumed', () => {
  renderShortcuts();
  expect(pressKey({ code: 'KeyQ', key: 'q', ctrlKey: true }).defaultPrevented).toBe(false);
});

test('a command the catalog does not support is not consumed', () => {
  commandState = { enabled: false, supported: false };
  renderShortcuts();
  expect(pressKey({ code: 'KeyL', key: 'l', ctrlKey: true }).defaultPrevented).toBe(false);
  expect(execute).not.toHaveBeenCalled();
});

test('a text field with content is skipped and an empty editing surface is not', () => {
  renderShortcuts();
  expect(pressKey({ code: 'KeyL', key: 'l', ctrlKey: true, target: appendField('input', 'title') }).defaultPrevented).toBe(false);
  expect(execute).not.toHaveBeenCalled();
  expect(pressKey({ code: 'KeyL', key: 'l', ctrlKey: true, target: appendField('textarea', '') }).defaultPrevented).toBe(true);
  expect(execute).toHaveBeenCalledWith('left');
});

test('an editor that is not ready ignores editing keys and still serves app keys', () => {
  renderShortcuts({ superdoc: null });
  expect(pressKey({ code: 'KeyL', key: 'l', ctrlKey: true }).defaultPrevented).toBe(false);
  expect(pressKey({ code: 'Slash', key: '/', ctrlKey: true }).defaultPrevented).toBe(true);
  expect(onShowShortcuts).toHaveBeenCalledTimes(1);
});

test('a reader has no editing keys and keeps the document and app keys', () => {
  renderShortcuts({ canEdit: false });
  expect(pressKey({ code: 'KeyL', key: 'l', ctrlKey: true }).defaultPrevented).toBe(false);
  expect(pressKey({ code: 'Period', key: '>', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
  expect(execute).not.toHaveBeenCalled();
  expect(pressKey({ code: 'KeyS', key: 's', ctrlKey: true }).defaultPrevented).toBe(true);
  expect(onDownload).toHaveBeenCalledWith(DownloadFormat.Docx);
});

test('save and print download the DOCX and the PDF', () => {
  renderShortcuts();
  expect(pressKey({ code: 'KeyP', key: 'p', ctrlKey: true }).defaultPrevented).toBe(true);
  expect(onDownload).toHaveBeenCalledWith(DownloadFormat.Pdf);
});

test('a question mark opens the modal only outside every text field', () => {
  renderShortcuts();
  expect(pressKey({ code: 'Slash', key: '?', shiftKey: true, target: appendField('textarea', '') }).defaultPrevented).toBe(false);
  expect(pressKey({ code: 'Slash', key: '?', shiftKey: true, target: appendField('input', '') }).defaultPrevented).toBe(false);
  expect(onShowShortcuts).not.toHaveBeenCalled();
  expect(pressKey({ code: 'Slash', key: '?', shiftKey: true }).defaultPrevented).toBe(true);
  expect(onShowShortcuts).toHaveBeenCalledTimes(1);
});

test('grow and shrink font step through the font sizes', () => {
  commandState = { enabled: true, supported: true, value: '12' };
  renderShortcuts();
  pressKey({ code: 'Period', key: '>', ctrlKey: true, shiftKey: true });
  expect(execute).toHaveBeenLastCalledWith('14');
  pressKey({ code: 'Comma', key: '<', ctrlKey: true, shiftKey: true });
  expect(execute).toHaveBeenLastCalledWith('11');
});

test('a font size at the end of the list stays', () => {
  commandState = { enabled: true, supported: true, value: '72' };
  renderShortcuts();
  pressKey({ code: 'Period', key: '>', ctrlKey: true, shiftKey: true });
  expect(execute).toHaveBeenLastCalledWith('72');
});

test('the listener is removed on unmount', () => {
  const { unmount } = renderShortcuts();
  unmount();
  expect(pressKey({ code: 'KeyL', key: 'l', ctrlKey: true }).defaultPrevented).toBe(false);
  expect(execute).not.toHaveBeenCalled();
});

const OPTION_KEYS = { ctrlKey: true, altKey: true };

test('a held toggle key is swallowed before it reaches the editing surface', () => {
  renderShortcuts();
  const surface = appendField('textarea', '');
  const reached = vi.fn();
  surface.addEventListener('keydown', reached);
  pressKey({ code: 'KeyB', key: 'b', ctrlKey: true, target: surface });
  const held = pressKey({ code: 'KeyB', key: 'b', ctrlKey: true, repeat: true, target: surface });
  expect(reached).toHaveBeenCalledTimes(1);
  expect(held.defaultPrevented).toBe(true);
});

test('a held one-shot app key runs once', () => {
  renderShortcuts();
  pressKey({ code: 'KeyS', key: 's', ctrlKey: true });
  pressKey({ code: 'KeyS', key: 's', ctrlKey: true, repeat: true });
  expect(onDownload).toHaveBeenCalledTimes(1);
});

test('a held zoom, font size or indent key keeps repeating', () => {
  renderShortcuts();
  pressKey({ code: 'Equal', key: '=', ...OPTION_KEYS, repeat: true });
  pressKey({ code: 'KeyM', key: 'm', ctrlKey: true, repeat: true });
  expect(setZoom).toHaveBeenCalledTimes(1);
  expect(execute).toHaveBeenCalledWith(undefined);
});

test('zoom in and out step through the zoom steps and stop at the ends', () => {
  renderShortcuts();
  pressKey({ code: 'Equal', key: '=', ...OPTION_KEYS });
  expect(setZoom).toHaveBeenLastCalledWith(125);
  pressKey({ code: 'Minus', key: '-', ...OPTION_KEYS });
  expect(setZoom).toHaveBeenLastCalledWith(90);
  zoomValue = 200;
  pressKey({ code: 'Equal', key: '=', ...OPTION_KEYS });
  expect(setZoom).toHaveBeenLastCalledWith(200);
});

test('a reader can zoom and toggle the edits panel but not summarize or comment', () => {
  renderShortcuts({ canEdit: false });
  expect(pressKey({ code: 'Equal', key: '=', ...OPTION_KEYS }).defaultPrevented).toBe(true);
  expect(pressKey({ code: 'KeyE', key: 'e', ...OPTION_KEYS }).defaultPrevented).toBe(true);
  expect(onToggleEditsPanel).toHaveBeenCalledTimes(1);
  expect(pressKey({ code: 'KeyS', key: 's', ...OPTION_KEYS }).defaultPrevented).toBe(false);
  expect(pressKey({ code: 'KeyM', key: 'm', ...OPTION_KEYS }).defaultPrevented).toBe(false);
  expect(onSummarize).not.toHaveBeenCalled();
  expect(onAddComment).not.toHaveBeenCalled();
});

test('an editor summarizes with Ctrl+Alt+S', () => {
  renderShortcuts();
  expect(pressKey({ code: 'KeyS', key: 's', ...OPTION_KEYS }).defaultPrevented).toBe(true);
  expect(onSummarize).toHaveBeenCalledTimes(1);
});

test('add comment is consumed only when the composer opens', () => {
  onAddComment.mockReturnValue(false);
  renderShortcuts();
  expect(pressKey({ code: 'KeyM', key: 'm', ...OPTION_KEYS }).defaultPrevented).toBe(false);
  expect(onAddComment).toHaveBeenCalledTimes(1);
  onAddComment.mockReturnValue(true);
  expect(pressKey({ code: 'KeyM', key: 'm', ...OPTION_KEYS }).defaultPrevented).toBe(true);
  expect(onAddComment).toHaveBeenCalledTimes(2);
});

test('next and previous comment walk the list and wrap', () => {
  renderShortcuts();
  pressKey({ code: 'KeyN', key: 'n', ...OPTION_KEYS });
  pressKey({ code: 'KeyN', key: 'n', ...OPTION_KEYS });
  expect(scrollToComment.mock.calls.map(([id]) => id)).toEqual(['first', 'second']);
  pressKey({ code: 'KeyP', key: 'p', ...OPTION_KEYS });
  pressKey({ code: 'KeyP', key: 'p', ...OPTION_KEYS });
  pressKey({ code: 'KeyP', key: 'p', ...OPTION_KEYS });
  expect(scrollToComment.mock.calls.map(([id]) => id).slice(2)).toEqual(['first', 'third', 'second']);
});

test('Alt zero and the platform clear-formatting keys run their commands', () => {
  renderShortcuts();
  pressKey({ code: 'Digit0', key: '0', ...OPTION_KEYS });
  expect(requestedCommandIds.at(-1)).toBe('linked-style');
  expect(execute).toHaveBeenLastCalledWith('Normal');
  pressKey({ code: 'Space', key: ' ', ctrlKey: true });
  expect(requestedCommandIds.at(-1)).toBe('clear-formatting');
});

test('on a Mac indent and clear formatting use the Docs keys', () => {
  vi.stubGlobal('navigator', { platform: 'MacIntel' });
  renderShortcuts();
  expect(pressKey({ code: 'KeyM', key: 'm', metaKey: true }).defaultPrevented).toBe(false);
  expect(pressKey({ code: 'BracketRight', key: ']', metaKey: true }).defaultPrevented).toBe(true);
  expect(requestedCommandIds.at(-1)).toBe('indent-increase');
  pressKey({ code: 'BracketLeft', key: '[', metaKey: true });
  expect(requestedCommandIds.at(-1)).toBe('indent-decrease');
  pressKey({ code: 'Backslash', key: '\\', metaKey: true });
  expect(requestedCommandIds.at(-1)).toBe('clear-formatting');
});

test('Ctrl+Alt+T switches between editing and suggesting and leaves viewing alone', () => {
  renderShortcuts();
  expect(pressKey({ code: 'KeyT', key: 't', ...OPTION_KEYS }).defaultPrevented).toBe(true);
  expect(setDocumentMode).toHaveBeenLastCalledWith('suggesting');
  documentMode = 'suggesting';
  pressKey({ code: 'KeyT', key: 't', ...OPTION_KEYS });
  expect(setDocumentMode).toHaveBeenLastCalledWith('editing');
  documentMode = 'viewing';
  expect(pressKey({ code: 'KeyT', key: 't', ...OPTION_KEYS }).defaultPrevented).toBe(false);
  expect(setDocumentMode).toHaveBeenCalledTimes(2);
});

test('a reader cannot switch track changes', () => {
  renderShortcuts({ canEdit: false });
  expect(pressKey({ code: 'KeyT', key: 't', ...OPTION_KEYS }).defaultPrevented).toBe(false);
  expect(setDocumentMode).not.toHaveBeenCalled();
});

test('AltGr characters are left to the editing surface', () => {
  renderShortcuts();
  const altGraph = { ...OPTION_KEYS, modifierAltGraph: true };
  expect(pressKey({ code: 'KeyE', key: '€', ...altGraph }).defaultPrevented).toBe(false);
  expect(pressKey({ code: 'KeyM', key: 'µ', ...altGraph }).defaultPrevented).toBe(false);
  expect(onToggleEditsPanel).not.toHaveBeenCalled();
  expect(onAddComment).not.toHaveBeenCalled();
});

test('Ctrl+Alt+F inserts a footnote at the caret through the Document API', () => {
  renderShortcuts();
  expect(pressKey({ code: 'KeyF', key: 'f', ...OPTION_KEYS }).defaultPrevented).toBe(true);
  expect(insertFootnote).toHaveBeenCalledWith({ type: 'footnote', content: '' });
});

test('Ctrl+Alt+F is not consumed without an active editor', () => {
  hasActiveEditor = false;
  renderShortcuts();
  expect(pressKey({ code: 'KeyF', key: 'f', ...OPTION_KEYS }).defaultPrevented).toBe(false);
  expect(insertFootnote).not.toHaveBeenCalled();
});

test('Ctrl+R and Ctrl+Shift+R are never consumed, so the browser reloads', () => {
  renderShortcuts();
  expect(pressKey({ code: 'KeyR', key: 'r', ctrlKey: true }).defaultPrevented).toBe(false);
  expect(pressKey({ code: 'KeyR', key: 'R', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
  expect(execute).not.toHaveBeenCalled();
});

test('Ctrl+Alt+R aligns right', () => {
  renderShortcuts();
  const event = pressKey({ code: 'KeyR', key: 'r', ...OPTION_KEYS });
  expect(execute).toHaveBeenCalledWith('right');
  expect(event.defaultPrevented).toBe(true);
});

test('Ctrl+Shift+R never reaches an editing surface that would consume it', () => {
  renderShortcuts();
  const surface = appendField('textarea', '');
  surface.addEventListener('keydown', (event) => event.preventDefault());
  expect(pressKey({ target: surface, code: 'KeyR', key: 'R', ctrlKey: true, shiftKey: true }).defaultPrevented).toBe(false);
});
