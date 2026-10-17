import { renderHook } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { useWindowMessage } from './use-window-message';

function postMessage(): void {
  window.dispatchEvent(new MessageEvent('message', { data: 'ping' }));
}

test('a window message reaches the latest handler and none after unmount', () => {
  const first = vi.fn();
  const second = vi.fn();
  const { rerender, unmount } = renderHook(({ handler }) => useWindowMessage(handler), { initialProps: { handler: first } });
  rerender({ handler: second });
  postMessage();
  expect(first).not.toHaveBeenCalled();
  expect(second).toHaveBeenCalledTimes(1);
  unmount();
  postMessage();
  expect(second).toHaveBeenCalledTimes(1);
});
