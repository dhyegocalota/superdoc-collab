import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SuperDoc } from 'superdoc';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import {
  DOWNLOAD_BUTTON_LABEL,
  DOWNLOAD_LABEL,
  DOWNLOAD_OPTIONS_LABEL,
  DOWNLOAD_PDF_LABEL,
  PDF_FAILED_MESSAGE,
  PDF_PRINT_HINT,
  PREPARING_PDF_MESSAGE,
} from './editor-copy';
import { DownloadFormat } from './download-format';
import { DownloadMenu, useDownload } from './download-menu';

type PrintConfig = { selector: HTMLElement; layoutEngineOptions: { virtualization: { enabled: boolean } }; onReady: () => void };

const { SuperDoc: PrintSuperDoc, superdocDestroy } = vi.hoisted(() => {
  const superdocDestroy = vi.fn();
  return {
    superdocDestroy,
    SuperDoc: vi.fn(function SuperDocStub(config: { selector: HTMLElement }) {
      ['one', 'two', ''].forEach((text) => {
        const page = document.createElement('div');
        page.className = 'superdoc-page';
        page.textContent = text;
        config.selector.append(page);
      });
      return { destroy: superdocDestroy };
    }),
  };
});

vi.mock('superdoc', () => ({ SuperDoc: PrintSuperDoc }));
vi.mock('superdoc/style.css', () => ({}));

const EXPORTED_BLOB = new Blob(['docx']);

function DownloadHarness({ superdoc, onDownloadDocx }: { superdoc: SuperDoc | null; onDownloadDocx: () => void }) {
  const { download, printView } = useDownload({ superdoc, onDownloadDocx });
  return (
    <>
      <DownloadMenu isDisabled={superdoc === null} onDownload={download} />
      {printView}
    </>
  );
}

function liveDocument(exportResult: Promise<Blob>) {
  return { export: vi.fn(() => exportResult) };
}

function printContainer(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-print-view]');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
  vi.spyOn(window, 'print').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  PrintSuperDoc.mockClear();
  superdocDestroy.mockClear();
});

test('the main part downloads DOCX and the chevron offers Download PDF', async () => {
  const onDownload = vi.fn();
  renderWithProviders(<DownloadMenu isDisabled={false} onDownload={onDownload} />);
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL }));
  expect(onDownload).toHaveBeenLastCalledWith(DownloadFormat.Docx);

  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_OPTIONS_LABEL }));
  expect(await screen.findByRole('menuitem', { name: DOWNLOAD_LABEL })).toBeVisible();
  await userEvent.click(screen.getByRole('menuitem', { name: DOWNLOAD_PDF_LABEL }));
  expect(onDownload).toHaveBeenLastCalledWith('pdf');
  expect(onDownload).toHaveBeenCalledTimes(2);
});

test('both parts are disabled while the editor is not ready', () => {
  renderWithProviders(<DownloadMenu isDisabled onDownload={vi.fn()} />);
  expect(screen.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL })).toBeDisabled();
  expect(screen.getByRole('button', { name: DOWNLOAD_OPTIONS_LABEL })).toBeDisabled();
});

test('Download PDF exports the live document to a Blob with triggerDownload false, mounts PrintView off-screen, calls window.print only after the last .superdoc-page has text, and afterprint unmounts it', async () => {
  const live = liveDocument(Promise.resolve(EXPORTED_BLOB));
  const onDownloadDocx = vi.fn();
  renderWithProviders(<DownloadHarness superdoc={live as unknown as SuperDoc} onDownloadDocx={onDownloadDocx} />);
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_OPTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: DOWNLOAD_PDF_LABEL }));

  expect(live.export).toHaveBeenCalledWith(expect.objectContaining({ triggerDownload: false }));
  expect(onDownloadDocx).not.toHaveBeenCalled();
  expect(await screen.findByText(PREPARING_PDF_MESSAGE)).toBeVisible();
  expect(screen.getByText(PDF_PRINT_HINT)).toBeVisible();
  await waitFor(() => expect(PrintSuperDoc).toHaveBeenCalledTimes(1));
  const config = PrintSuperDoc.mock.calls[0]![0] as unknown as PrintConfig;
  expect(config.layoutEngineOptions.virtualization.enabled).toBe(false);
  expect(printContainer()).toBeInTheDocument();

  act(() => config.onReady());
  act(() => vi.advanceTimersToNextFrame());
  expect(window.print).not.toHaveBeenCalled();
  const lastPage = printContainer()!.querySelector('.superdoc-page:last-of-type')!;
  lastPage.textContent = 'paragraph';
  act(() => vi.advanceTimersToNextFrame());
  expect(window.print).toHaveBeenCalledTimes(1);

  act(() => {
    window.dispatchEvent(new Event('afterprint'));
  });
  expect(printContainer()).toBeNull();
  expect(superdocDestroy).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByText(PREPARING_PDF_MESSAGE)).toBeNull());
});

test('a failed export shows the PDF failure toast and prints nothing', async () => {
  const live = liveDocument(Promise.reject(new Error('export failed')));
  renderWithProviders(<DownloadHarness superdoc={live as unknown as SuperDoc} onDownloadDocx={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_OPTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: DOWNLOAD_PDF_LABEL }));
  expect(await screen.findByText(PDF_FAILED_MESSAGE)).toBeVisible();
  expect(printContainer()).toBeNull();
  expect(window.print).not.toHaveBeenCalled();
});

test('the main part hands the DOCX to the page and does not export a PDF', async () => {
  const live = liveDocument(Promise.resolve(EXPORTED_BLOB));
  const onDownloadDocx = vi.fn();
  renderWithProviders(<DownloadHarness superdoc={live as unknown as SuperDoc} onDownloadDocx={onDownloadDocx} />);
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL }));
  expect(onDownloadDocx).toHaveBeenCalledTimes(1);
  expect(live.export).not.toHaveBeenCalled();
});
