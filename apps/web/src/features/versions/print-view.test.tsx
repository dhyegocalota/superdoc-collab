import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { PrintView } from './print-view';

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

function printViewContainer(): HTMLElement {
  const container = document.querySelector<HTMLElement>('[data-print-view]');
  if (!container) throw new Error('print view is not mounted');
  return container;
}

function lastPage(): Element {
  const page = printViewContainer().querySelector('.superdoc-page:last-of-type');
  if (!page) throw new Error('no page painted');
  return page;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  vi.spyOn(window, 'print').mockImplementation(() => undefined);
  pagesToPaint.splice(0, pagesToPaint.length, 'one', 'two', 'three', '');
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  SuperDoc.mockClear();
  superdocDestroy.mockClear();
});

test('the container height is page count × 1056 px, measured after onReady, and virtualization is off', () => {
  render(<PrintView file={FILE} onClose={vi.fn()} onFailed={vi.fn()} />);
  const config = constructedConfig();
  expect(config.layoutEngineOptions.virtualization.enabled).toBe(false);
  expect(config.documentMode).toBe('viewing');
  expect(config.documents[0]?.data).toBe(FILE);
  expect(config.collaboration).toBeUndefined();
  expect(printViewContainer().style.height).not.toBe('4224px');
  act(() => config.onReady());
  expect(printViewContainer().style.height).toBe('4224px');
});

test('window.print is called only after the last page has text', () => {
  const printedLength = vi.fn();
  vi.mocked(window.print).mockImplementation(() => printedLength(lastPage().textContent?.length));
  render(<PrintView file={FILE} onClose={vi.fn()} onFailed={vi.fn()} />);
  act(() => constructedConfig().onReady());
  act(() => vi.advanceTimersToNextFrame());
  act(() => vi.advanceTimersToNextFrame());
  expect(window.print).not.toHaveBeenCalled();
  lastPage().textContent = 'paragraph';
  act(() => vi.advanceTimersToNextFrame());
  expect(window.print).toHaveBeenCalledTimes(1);
  expect(printedLength).toHaveBeenCalledWith(9);
});

test('a last page that never gets text fails after a bounded number of frames and never prints', () => {
  const onFailed = vi.fn();
  render(<PrintView file={FILE} onClose={vi.fn()} onFailed={onFailed} />);
  act(() => constructedConfig().onReady());
  act(() => Array.from({ length: 1000 }).forEach(() => vi.advanceTimersToNextFrame()));
  expect(onFailed).toHaveBeenCalledTimes(1);
  expect(window.print).not.toHaveBeenCalled();
});

test('afterprint closes the view and unmounting destroys the editor', () => {
  const onClose = vi.fn();
  const { unmount } = render(<PrintView file={FILE} onClose={onClose} onFailed={vi.fn()} />);
  window.dispatchEvent(new Event('afterprint'));
  expect(onClose).toHaveBeenCalledTimes(1);
  unmount();
  expect(superdocDestroy).toHaveBeenCalledTimes(1);
});

test('an editor exception fails the preparation', () => {
  const onFailed = vi.fn();
  render(<PrintView file={FILE} onClose={vi.fn()} onFailed={onFailed} />);
  act(() => constructedConfig().onException());
  expect(onFailed).toHaveBeenCalledTimes(1);
});
