import { cleanup, screen, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import { toast } from 'sonner';
import userEvent from '@testing-library/user-event';
import type { SuperDoc } from 'superdoc';
import { afterEach, expect, test, vi } from 'vitest';
import { findPrintFrame, frameWindowOf, printFrame, sendFromFrame } from '@/testing/print-frame';
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
import { PrintMessageKind } from '@/features/versions/print-messages';
import { DownloadMenu, useDownload } from './download-menu';

const DOCUMENT_ENTRY = 'word/document.xml';
const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const EXPORTED_DOCUMENT_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="${WORD_NAMESPACE}"><w:body><w:p><w:ins w:id="0" w:author="Ana" w:date="2026-10-21T10:00:00Z" w16du:dateUtc="2026-10-21T13:00:00Z"><w:r><w:t>hi</w:t></w:r></w:ins></w:p></w:body></w:document>`;

async function exportedDocx(): Promise<Blob> {
  const zip = new JSZip();
  zip.file(DOCUMENT_ENTRY, EXPORTED_DOCUMENT_XML);
  return zip.generateAsync({ type: 'blob' });
}

async function documentXmlOf(file: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(file);
  return zip.file(DOCUMENT_ENTRY)!.async('string');
}

const EXPORTED_BLOB = await exportedDocx();

function DownloadHarness({ superdoc, onDownloadDocx }: { superdoc: SuperDoc | null; onDownloadDocx: () => void }) {
  const { download, printView } = useDownload({ superdoc, onDownloadDocx });
  return (
    <>
      <DownloadMenu isDisabled={superdoc === null} onDownload={download} />
      {printView}
    </>
  );
}

function liveDocument(exportBlob: () => Promise<Blob>) {
  return { export: vi.fn(exportBlob) };
}

afterEach(() => {
  vi.restoreAllMocks();
  toast.dismiss();
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

test('Download PDF exports the live document to a Blob with triggerDownload false, mounts the print frame off-screen, prints only after the frame reports Painted, and afterprint unmounts it', async () => {
  const live = liveDocument(() => Promise.resolve(EXPORTED_BLOB));
  const onDownloadDocx = vi.fn();
  renderWithProviders(<DownloadHarness superdoc={live as unknown as SuperDoc} onDownloadDocx={onDownloadDocx} />);
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_OPTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: DOWNLOAD_PDF_LABEL }));

  expect(live.export).toHaveBeenCalledWith(expect.objectContaining({ triggerDownload: false }));
  expect(onDownloadDocx).not.toHaveBeenCalled();
  expect(await screen.findByText(PREPARING_PDF_MESSAGE)).toBeVisible();
  expect(screen.getByText(PDF_PRINT_HINT)).toBeVisible();
  await waitFor(() => expect(findPrintFrame()).not.toBeNull());
  const frameWindow = frameWindowOf(printFrame());
  const postMessage = vi.spyOn(frameWindow, 'postMessage').mockImplementation(() => undefined);

  sendFromFrame({ source: frameWindow, message: { kind: PrintMessageKind.Ready } });
  expect(postMessage).toHaveBeenCalledWith({ kind: PrintMessageKind.Load, file: expect.any(Blob) }, window.location.origin);
  const printedFile = postMessage.mock.calls.map(([message]) => (message as { file?: Blob }).file).find((file) => file instanceof Blob);
  expect(await documentXmlOf(printedFile!)).toContain('xmlns:w16du="http://schemas.microsoft.com/office/word/2023/wordml/word16du"');
  sendFromFrame({ source: frameWindow, message: { kind: PrintMessageKind.PageCount, pageCount: 3 } });
  expect(printFrame().style.height).toBe('3168px');
  expect(postMessage).not.toHaveBeenCalledWith({ kind: PrintMessageKind.Print }, window.location.origin);
  sendFromFrame({ source: frameWindow, message: { kind: PrintMessageKind.Painted } });
  expect(postMessage).toHaveBeenCalledWith({ kind: PrintMessageKind.Print }, window.location.origin);

  sendFromFrame({ source: frameWindow, message: { kind: PrintMessageKind.Closed } });
  expect(findPrintFrame()).toBeNull();
  await waitFor(() => expect(screen.queryByText(PREPARING_PDF_MESSAGE)).toBeNull());
});

test('a failure reported by the print frame shows the PDF failure toast and removes the frame', async () => {
  const live = liveDocument(() => Promise.resolve(EXPORTED_BLOB));
  renderWithProviders(<DownloadHarness superdoc={live as unknown as SuperDoc} onDownloadDocx={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_OPTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: DOWNLOAD_PDF_LABEL }));
  await waitFor(() => expect(findPrintFrame()).not.toBeNull());
  sendFromFrame({ source: frameWindowOf(printFrame()), message: { kind: PrintMessageKind.Failed } });
  await waitFor(() => expect(screen.getByText(PDF_FAILED_MESSAGE)).toBeVisible());
  expect(findPrintFrame()).toBeNull();
});

test('a failed export shows the PDF failure toast and prints nothing', async () => {
  const live = liveDocument(() => Promise.reject(new Error('export failed')));
  renderWithProviders(<DownloadHarness superdoc={live as unknown as SuperDoc} onDownloadDocx={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_OPTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: DOWNLOAD_PDF_LABEL }));
  await waitFor(() => expect(screen.getByText(PDF_FAILED_MESSAGE)).toBeVisible());
  expect(findPrintFrame()).toBeNull();
});

test('the main part hands the DOCX to the page and does not export a PDF', async () => {
  const live = liveDocument(() => Promise.resolve(EXPORTED_BLOB));
  const onDownloadDocx = vi.fn();
  renderWithProviders(<DownloadHarness superdoc={live as unknown as SuperDoc} onDownloadDocx={onDownloadDocx} />);
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_BUTTON_LABEL }));
  expect(onDownloadDocx).toHaveBeenCalledTimes(1);
  expect(live.export).not.toHaveBeenCalled();
});

test('leaving the page while the PDF prepares dismisses the preparing toast', async () => {
  const dismiss = vi.spyOn(toast, 'dismiss');
  const live = liveDocument(() => new Promise<Blob>(() => undefined));
  renderWithProviders(<DownloadHarness superdoc={live as unknown as SuperDoc} onDownloadDocx={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: DOWNLOAD_OPTIONS_LABEL }));
  await userEvent.click(await screen.findByRole('menuitem', { name: DOWNLOAD_PDF_LABEL }));
  expect(await screen.findByText(PREPARING_PDF_MESSAGE)).toBeVisible();
  expect(dismiss).not.toHaveBeenCalled();
  cleanup();
  expect(dismiss).toHaveBeenCalledTimes(1);
});
