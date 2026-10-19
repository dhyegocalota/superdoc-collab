import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi, type MockInstance } from 'vitest';
import { PrintMessageKind } from './print-messages';
import { PrintPage } from './print-page';

type PrintConfig = {
  selector: HTMLElement;
  documentMode: string;
  documents: { data: Blob }[];
  layoutEngineOptions: { virtualization: { enabled: boolean } };
  collaboration?: unknown;
  onReady: () => void;
  onException: () => void;
};

const { SuperDoc, superdocDestroy, pagesToPaint, buildPage } = vi.hoisted(() => {
  const superdocDestroy = vi.fn();
  const pagesToPaint: (string | null)[] = [];
  function buildPage(fragmentText: string | null): HTMLElement {
    const page = document.createElement('div');
    page.className = 'superdoc-page';
    if (fragmentText === null) return page;
    const fragment = document.createElement('div');
    fragment.className = 'superdoc-fragment';
    fragment.textContent = fragmentText;
    page.append(fragment);
    return page;
  }
  return {
    superdocDestroy,
    pagesToPaint,
    buildPage,
    SuperDoc: vi.fn(function SuperDocStub(config: { selector: HTMLElement }) {
      pagesToPaint.forEach((fragmentText) => config.selector.append(buildPage(fragmentText)));
      return { destroy: superdocDestroy };
    }),
  };
});

vi.mock('superdoc', () => ({ SuperDoc }));
vi.mock('superdoc/style.css', () => ({}));

const FILE = new Blob(['docx']);

function constructedConfig(): PrintConfig {
  const firstCall = SuperDoc.mock.calls.at(0);
  if (!firstCall) throw new Error('SuperDoc was not constructed');
  return firstCall[0] as unknown as PrintConfig;
}

function sentKinds(postMessage: MockInstance<typeof window.postMessage>): unknown[] {
  return postMessage.mock.calls.map(([message]) => (message as { kind: unknown }).kind);
}

function lastPage(): Element {
  const page = document.querySelector('.superdoc-page:last-of-type');
  if (!page) throw new Error('no page painted');
  return page;
}

function sendFile(): void {
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data: { kind: PrintMessageKind.Load, file: FILE }, origin: window.location.origin, source: window }),
    );
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  pagesToPaint.splice(0, pagesToPaint.length, 'one', 'two', 'three', '');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  SuperDoc.mockClear();
  superdocDestroy.mockClear();
});

test('announces itself to the parent and opens nothing until the file arrives', () => {
  const postMessage = vi.spyOn(window, 'postMessage');
  render(<PrintPage />);
  expect(sentKinds(postMessage)).toEqual([PrintMessageKind.Ready]);
  expect(postMessage).toHaveBeenCalledWith({ kind: PrintMessageKind.Ready }, window.location.origin);
  expect(SuperDoc).not.toHaveBeenCalled();
});

test('opens the file non-collaboratively in viewing mode with virtualization off, and reports the page count after onReady', () => {
  const postMessage = vi.spyOn(window, 'postMessage');
  render(<PrintPage />);
  sendFile();
  const config = constructedConfig();
  expect(config.documents[0]?.data).toBe(FILE);
  expect(config.documentMode).toBe('viewing');
  expect(config.layoutEngineOptions.virtualization.enabled).toBe(false);
  expect(config.collaboration).toBeUndefined();
  expect(sentKinds(postMessage)).not.toContain(PrintMessageKind.PageCount);
  act(() => config.onReady());
  expect(postMessage).toHaveBeenCalledWith({ kind: PrintMessageKind.PageCount, pageCount: 4 }, window.location.origin);
});

test('reports Painted for a page whose fragment has no text', () => {
  const postMessage = vi.spyOn(window, 'postMessage');
  pagesToPaint.splice(0, pagesToPaint.length, '');
  render(<PrintPage />);
  sendFile();
  act(() => constructedConfig().onReady());
  act(() => vi.advanceTimersToNextFrame());
  expect(sentKinds(postMessage).filter((kind) => kind === PrintMessageKind.Painted)).toHaveLength(1);
});

test('does not report Painted for a page shell without a fragment', () => {
  const postMessage = vi.spyOn(window, 'postMessage');
  pagesToPaint.splice(0, pagesToPaint.length, null);
  render(<PrintPage />);
  sendFile();
  act(() => constructedConfig().onReady());
  act(() => vi.advanceTimersToNextFrame());
  act(() => vi.advanceTimersToNextFrame());
  expect(sentKinds(postMessage)).not.toContain(PrintMessageKind.Painted);
});

test('reports Painted only after every page has a fragment', () => {
  const postMessage = vi.spyOn(window, 'postMessage');
  pagesToPaint.splice(0, pagesToPaint.length, 'one', null, 'three', 'four');
  render(<PrintPage />);
  sendFile();
  act(() => constructedConfig().onReady());
  act(() => vi.advanceTimersToNextFrame());
  act(() => vi.advanceTimersToNextFrame());
  expect(sentKinds(postMessage)).not.toContain(PrintMessageKind.Painted);
  const pages = document.querySelectorAll('.superdoc-page');
  pages[1]!.append(buildPage('').firstElementChild!);
  act(() => vi.advanceTimersToNextFrame());
  expect(sentKinds(postMessage).filter((kind) => kind === PrintMessageKind.Painted)).toHaveLength(1);
});

test('announces the page count again when more pages appear after onReady', () => {
  const postMessage = vi.spyOn(window, 'postMessage');
  pagesToPaint.splice(0, pagesToPaint.length, 'one', 'two');
  render(<PrintPage />);
  sendFile();
  act(() => constructedConfig().onReady());
  expect(postMessage).toHaveBeenLastCalledWith({ kind: PrintMessageKind.PageCount, pageCount: 2 }, window.location.origin);
  const container = document.querySelector('[data-testid="print-page"]')!;
  ['three', 'four'].forEach((text) => container.append(buildPage(text)));
  act(() => vi.advanceTimersToNextFrame());
  expect(postMessage).toHaveBeenCalledWith({ kind: PrintMessageKind.PageCount, pageCount: 4 }, window.location.origin);
  expect(sentKinds(postMessage)).toContain(PrintMessageKind.Painted);
});

test('prints its own window on the Print message and reports Closed after printing', () => {
  const postMessage = vi.spyOn(window, 'postMessage');
  const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
  render(<PrintPage />);
  expect(print).not.toHaveBeenCalled();
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data: { kind: PrintMessageKind.Print }, origin: window.location.origin, source: window }),
    );
  });
  expect(print).toHaveBeenCalledTimes(1);
  act(() => {
    window.dispatchEvent(new Event('afterprint'));
  });
  expect(postMessage).toHaveBeenCalledWith({ kind: PrintMessageKind.Closed }, window.location.origin);
});

test('a document with no pages and an editor exception both fail', () => {
  const postMessage = vi.spyOn(window, 'postMessage');
  pagesToPaint.splice(0, pagesToPaint.length);
  render(<PrintPage />);
  sendFile();
  act(() => constructedConfig().onReady());
  expect(sentKinds(postMessage)).toEqual([PrintMessageKind.Ready, PrintMessageKind.Failed]);
  act(() => constructedConfig().onException());
  expect(sentKinds(postMessage).filter((kind) => kind === PrintMessageKind.Failed)).toHaveLength(2);
});

test('ignores a file from another origin', () => {
  render(<PrintPage />);
  act(() => {
    window.dispatchEvent(
      new MessageEvent('message', { data: { kind: PrintMessageKind.Load, file: FILE }, origin: 'https://example.invalid', source: window }),
    );
  });
  expect(SuperDoc).not.toHaveBeenCalled();
});

test('destroys the editor on unmount', () => {
  const { unmount } = render(<PrintPage />);
  sendFile();
  unmount();
  expect(superdocDestroy).toHaveBeenCalledTimes(1);
});
