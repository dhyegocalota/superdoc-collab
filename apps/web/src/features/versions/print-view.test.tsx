import { AppRoute, PRINT_READY_TIMEOUT_MS } from '@superdoc-collab/types';
import { act, render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { frameWindowOf, printFrame, sendFromFrame } from '@/testing/print-frame';
import { PrintMessageKind, type PrintMessage } from './print-messages';
import { PrintView } from './print-view';

const FILE = new Blob(['docx']);

function renderPrintView() {
  const onClose = vi.fn();
  const onFailed = vi.fn();
  render(<PrintView file={FILE} onClose={onClose} onFailed={onFailed} />);
  const frameWindow = frameWindowOf(printFrame());
  const postMessage = vi.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);
  return { onClose, onFailed, postMessage };
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

test('asks the frame to print only once it reports Painted, and Closed closes the view', () => {
  const { postMessage, onClose } = renderPrintView();
  sendFromFrame({ message: { kind: PrintMessageKind.PageCount, pageCount: 4 } });
  expect(postMessage).not.toHaveBeenCalledWith({ kind: PrintMessageKind.Print }, window.location.origin);
  sendFromFrame({ message: { kind: PrintMessageKind.Painted } });
  expect(postMessage).toHaveBeenCalledWith({ kind: PrintMessageKind.Print }, window.location.origin);
  expect(postMessage.mock.calls.filter(([message]) => (message as PrintMessage).kind === PrintMessageKind.Print)).toHaveLength(1);
  sendFromFrame({ message: { kind: PrintMessageKind.Closed } });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('a failure of the frame fails the preparation and prints nothing', () => {
  const { postMessage, onFailed } = renderPrintView();
  sendFromFrame({ message: { kind: PrintMessageKind.Failed } });
  expect(onFailed).toHaveBeenCalledTimes(1);
  expect(postMessage).not.toHaveBeenCalled();
});

test('a message from another window is ignored', () => {
  const { postMessage, onFailed } = renderPrintView();
  sendFromFrame({ message: { kind: PrintMessageKind.Painted }, source: window });
  sendFromFrame({ message: { kind: PrintMessageKind.Failed }, source: window });
  expect(postMessage).not.toHaveBeenCalled();
  expect(onFailed).not.toHaveBeenCalled();
});

test('a frame that never reports Painted fails the preparation after the timeout, once', () => {
  vi.useFakeTimers();
  const { onFailed, postMessage } = renderPrintView();
  sendFromFrame({ message: { kind: PrintMessageKind.Ready } });
  act(() => vi.advanceTimersByTime(PRINT_READY_TIMEOUT_MS - 1));
  expect(onFailed).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(onFailed).toHaveBeenCalledTimes(1);
  act(() => vi.advanceTimersByTime(PRINT_READY_TIMEOUT_MS));
  expect(onFailed).toHaveBeenCalledTimes(1);
  expect(postMessage).not.toHaveBeenCalledWith({ kind: PrintMessageKind.Print }, window.location.origin);
});

test('Painted before the timeout cancels it', () => {
  vi.useFakeTimers();
  const { onFailed } = renderPrintView();
  sendFromFrame({ message: { kind: PrintMessageKind.Painted } });
  act(() => vi.advanceTimersByTime(PRINT_READY_TIMEOUT_MS * 2));
  expect(onFailed).not.toHaveBeenCalled();
});
