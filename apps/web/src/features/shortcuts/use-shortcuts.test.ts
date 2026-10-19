import { renderHook } from '@testing-library/react';
import type { SuperDoc } from 'superdoc';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DownloadFormat } from '@/features/editor/download-format';
import { superdocStub } from '@/testing/superdoc-stub';
import { useShortcuts } from './use-shortcuts';

type KeyOptions = KeyboardEventInit & { target?: HTMLElement };

const onDownload = vi.fn();
const onShowShortcuts = vi.fn();
const execute = vi.fn();
let commandState: { enabled: boolean; supported: boolean; value?: string };
let requestedCommandIds: string[];

function superdocWithCommands(): SuperDoc {
  const get = vi.fn((commandId: string) => {
    requestedCommandIds.push(commandId);
    return { getState: () => commandState, execute };
  });
  return superdocStub({ ui: { commands: { get } } });
}

function pressKey({ target = document.body, ...init }: KeyOptions): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
}

function renderShortcuts({ superdoc = superdocWithCommands(), canEdit = true }: { superdoc?: SuperDoc | null; canEdit?: boolean } = {}) {
  return renderHook(() => useShortcuts({ superdoc, canEdit, onDownload, onShowShortcuts }));
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
