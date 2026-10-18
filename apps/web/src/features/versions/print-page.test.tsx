import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
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

const { SuperDoc, superdocDestroy, pagesToPaint } = vi.hoisted(() => {
  const superdocDestroy = vi.fn();
  const pagesToPaint: string[] = [];
  return {
    superdocDestroy,
    pagesToPaint,
    SuperDoc: vi.fn(function SuperDocStub(config: { selector: HTMLElement }) {
      pagesToPaint.forEach((text) => {
        const page = document.createElement('div');
        page.className = 'superdoc-page';
        page.textContent = text;
        config.selector.append(page);
      });
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

function sentKinds(postMessage: ReturnType<typeof vi.spyOn>): unknown[] {
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

test('reports Painted only after the last page has text', () => {
  const postMessage = vi.spyOn(window, 'postMessage');
  render(<PrintPage />);
  sendFile();
  act(() => constructedConfig().onReady());
  act(() => vi.advanceTimersToNextFrame());
  act(() => vi.advanceTimersToNextFrame());
  expect(sentKinds(postMessage)).not.toContain(PrintMessageKind.Painted);
  lastPage().textContent = 'paragraph';
  act(() => vi.advanceTimersToNextFrame());
  expect(sentKinds(postMessage)).toContain(PrintMessageKind.Painted);
});

test('a last page that never gets text fails after a bounded number of frames', () => {
  const postMessage = vi.spyOn(window, 'postMessage');
  render(<PrintPage />);
  sendFile();
  act(() => constructedConfig().onReady());
  act(() => Array.from({ length: 1000 }).forEach(() => vi.advanceTimersToNextFrame()));
  expect(sentKinds(postMessage).filter((kind) => kind === PrintMessageKind.Failed)).toHaveLength(1);
  expect(sentKinds(postMessage)).not.toContain(PrintMessageKind.Painted);
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
