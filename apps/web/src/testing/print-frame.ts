import { act } from '@testing-library/react';
import type { PrintMessage } from '@/features/versions/print-messages';

export function findPrintFrame(): HTMLIFrameElement | null {
  return document.querySelector<HTMLIFrameElement>('iframe[data-print-view]');
}

export function printFrame(): HTMLIFrameElement {
  const frame = findPrintFrame();
  if (!frame) throw new Error('print view is not mounted');
  return frame;
}

export function frameWindowOf(frame: HTMLIFrameElement): Window {
  if (!frame.contentWindow) throw new Error('the print frame has no window');
  return frame.contentWindow;
}

export function sendFromFrame({
  message,
  source = frameWindowOf(printFrame()),
}: {
  message: PrintMessage;
  source?: MessageEventSource;
}): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: message, origin: window.location.origin, source }));
  });
}
