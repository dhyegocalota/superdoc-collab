import { AppRoute, PRINT_READY_TIMEOUT_MS } from '@superdoc-collab/types';
import { act, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { PrintMessageKind, type PrintMessage } from './print-messages';
import { PrintView } from './print-view';

const FILE = new Blob(['docx']);

function printFrame(): HTMLIFrameElement {
  const frame = document.querySelector<HTMLIFrameElement>('iframe[data-print-view]');
  if (!frame) throw new Error('print view is not mounted');
  return frame;
}

function frameWindowOf(frame: HTMLIFrameElement): Window {
  if (!frame.contentWindow) throw new Error('the print frame has no window');
  return frame.contentWindow;
}

function sendFromFrame({ message, source = frameWindowOf(printFrame()) }: { message: PrintMessage; source?: MessageEventSource }): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data: message, origin: window.location.origin, source }));
  });
}

function renderPrintView() {
  const onClose = vi.fn();
  const onFailed = vi.fn();
  render(<PrintView file={FILE} onClose={onClose} onFailed={onFailed} />);
  const frameWindow = frameWindowOf(printFrame());
  const postMessage = vi.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
  const print = vi.spyOn(frameWindow, 'print').mockImplementation(() => undefined);
  return { onClose, onFailed, frameWindow, postMessage, print };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('mounts an off-screen same-origin frame on the print route and hands it the file when it is ready', () => {
  const { postMessage } = renderPrintView();
  expect(printFrame()).toHaveAttribute('src', AppRoute.Print);
  expect(printFrame()).toHaveAttribute('aria-hidden', 'true');
  expect(postMessage).not.toHaveBeenCalled();
  sendFromFrame({ message: { kind: PrintMessageKind.Ready } });
  expect(postMessage).toHaveBeenCalledWith({ kind: PrintMessageKind.Load, file: FILE }, window.location.origin);
});

test('the frame height is page count × 1056 px once the frame reports its pages', () => {
  renderPrintView();
  expect(printFrame().style.height).not.toBe('4224px');
  sendFromFrame({ message: { kind: PrintMessageKind.PageCount, pageCount: 4 } });
  expect(printFrame().style.height).toBe('4224px');
});

test('prints the frame only once it reports Painted, and afterprint closes the view', () => {
  const { print, onClose, frameWindow } = renderPrintView();
  sendFromFrame({ message: { kind: PrintMessageKind.PageCount, pageCount: 4 } });
  expect(print).not.toHaveBeenCalled();
  sendFromFrame({ message: { kind: PrintMessageKind.Painted } });
  expect(print).toHaveBeenCalledTimes(1);
  act(() => {
    frameWindow.dispatchEvent(new Event('afterprint'));
  });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('a failure of the frame fails the preparation and prints nothing', () => {
  const { print, onFailed } = renderPrintView();
  sendFromFrame({ message: { kind: PrintMessageKind.Failed } });
  expect(onFailed).toHaveBeenCalledTimes(1);
  expect(print).not.toHaveBeenCalled();
});

test('a message from another window is ignored', () => {
  const { print, onFailed } = renderPrintView();
  sendFromFrame({ message: { kind: PrintMessageKind.Painted }, source: window });
  sendFromFrame({ message: { kind: PrintMessageKind.Failed }, source: window });
  expect(print).not.toHaveBeenCalled();
  expect(onFailed).not.toHaveBeenCalled();
});

test('a frame that never reports Painted fails the preparation after the timeout, once', () => {
  vi.useFakeTimers();
  const { onFailed, print } = renderPrintView();
  sendFromFrame({ message: { kind: PrintMessageKind.Ready } });
  act(() => vi.advanceTimersByTime(PRINT_READY_TIMEOUT_MS - 1));
  expect(onFailed).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(onFailed).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(PRINT_READY_TIMEOUT_MS));
  expect(onFailed).toHaveBeenCalledTimes(1);
  expect(print).not.toHaveBeenCalled();
});

test('Painted before the timeout cancels it', () => {
  vi.useFakeTimers();
  const { onFailed } = renderPrintView();
  sendFromFrame({ message: { kind: PrintMessageKind.Painted } });
  act(() => vi.advanceTimersByTime(PRINT_READY_TIMEOUT_MS * 2));
  expect(onFailed).not.toHaveBeenCalled();
});
