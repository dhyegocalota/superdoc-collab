import { fireEvent, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { KeyboardKey } from './keyboard';
import { useEscapeKey } from './use-escape-key';

afterEach(() => document.body.replaceChildren());

test('Escape calls the latest handler while enabled', () => {
  const first = vi.fn();
  const second = vi.fn();
  const { rerender } = renderHook(({ onEscape }) => useEscapeKey({ isEnabled: true, onEscape }), { initialProps: { onEscape: first } });
  rerender({ onEscape: second });
  fireEvent.keyDown(document.body, { key: KeyboardKey.Escape });
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
});

test('a disabled hook, another key and a handled Escape do nothing', () => {
  const onEscape = vi.fn();
  const { rerender } = renderHook(({ isEnabled }) => useEscapeKey({ isEnabled, onEscape }), { initialProps: { isEnabled: false } });
  fireEvent.keyDown(document.body, { key: KeyboardKey.Escape });
  rerender({ isEnabled: true });
  fireEvent.keyDown(document.body, { key: KeyboardKey.Enter });
  const handled = new KeyboardEvent('keydown', { key: KeyboardKey.Escape, bubbles: true, cancelable: true });
  handled.preventDefault();
  document.body.dispatchEvent(handled);
  expect(onEscape).not.toHaveBeenCalled();
});

test('an Escape stopped before it reaches the document does nothing', () => {
  const onEscape = vi.fn();
  const inner = document.createElement('div');
  document.body.append(inner);
  inner.addEventListener('keydown', (event) => event.stopPropagation());
  renderHook(() => useEscapeKey({ isEnabled: true, onEscape }));
  fireEvent.keyDown(inner, { key: KeyboardKey.Escape });
  expect(onEscape).not.toHaveBeenCalled();
});
