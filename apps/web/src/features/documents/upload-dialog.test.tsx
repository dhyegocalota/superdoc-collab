import {
  DocumentRole,
  DOCX_MIME_TYPE,
  documentPagePath,
  HttpStatus,
  MAX_UPLOAD_BYTES,
  NOT_A_DOCX_MESSAGE,
  UPLOAD_TOO_LARGE_MESSAGE,
} from '@superdoc-collab/types';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { requestFailedMessage } from '@/lib/api';
import { jsonResponse } from '@/testing/json-response';
import { renderWithProviders } from '@/testing/render-with-providers';
import { FILE_INPUT_LABEL, UPLOAD_LABEL, UPLOAD_SUBJECT, UPLOADING_MESSAGE } from './documents-copy';
import { UploadDialog } from './upload-dialog';

const UPLOADED_DOCUMENT = { id: 'doc-1', title: 'plan', owner: { id: 'user-1', name: 'Ada' }, updatedAt: 1, role: DocumentRole.Owner };

function docxFile({ name, size }: { name: string; size: number }): File {
  return new File([new Uint8Array(size)], name, { type: DOCX_MIME_TYPE });
}

async function chooseFile(file: File): Promise<void> {
  const user = userEvent.setup({ applyAccept: false });
  await user.click(screen.getByRole('button', { name: UPLOAD_LABEL }));
  await user.upload(screen.getByLabelText(FILE_INPUT_LABEL), file);
}

afterEach(() => vi.restoreAllMocks());

test('a file over 10 MB shows the limit and sends nothing', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  renderWithProviders(<UploadDialog />);
  await chooseFile(docxFile({ name: 'big.docx', size: MAX_UPLOAD_BYTES + 1 }));
  expect(await screen.findByRole('alert')).toHaveTextContent(UPLOAD_TOO_LARGE_MESSAGE);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a pdf shows the docx-only message and sends nothing', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  renderWithProviders(<UploadDialog />);
  await chooseFile(docxFile({ name: 'report.pdf', size: 10 }));
  expect(await screen.findByRole('alert')).toHaveTextContent(NOT_A_DOCX_MESSAGE);
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('a 415 response shows the docx-only message', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.UnsupportedMediaType }));
  renderWithProviders(<UploadDialog />);
  await chooseFile(docxFile({ name: 'fake.docx', size: 10 }));
  expect(await screen.findByRole('alert')).toHaveTextContent(NOT_A_DOCX_MESSAGE);
});

test('a 201 response closes the dialog and opens the document', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({ body: UPLOADED_DOCUMENT, status: HttpStatus.Created }));
  const { router } = renderWithProviders(<UploadDialog />);
  await chooseFile(docxFile({ name: 'plan.docx', size: 10 }));
  await waitFor(() => expect(router.state.location.pathname).toBe(documentPagePath(UPLOADED_DOCUMENT.id)));
  expect(screen.queryByLabelText(FILE_INPUT_LABEL)).not.toBeInTheDocument();
});

test('while the upload runs the input is disabled and the wait is announced', async () => {
  vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => undefined));
  renderWithProviders(<UploadDialog />);
  await chooseFile(docxFile({ name: 'plan.docx', size: 10 }));
  expect(await screen.findByRole('status')).toHaveTextContent(UPLOADING_MESSAGE);
  expect(screen.getByLabelText(FILE_INPUT_LABEL)).toBeDisabled();
});

test('a server failure shows its status and a rejected file afterwards shows only the rejection', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: HttpStatus.InternalServerError }));
  renderWithProviders(<UploadDialog />);
  await chooseFile(docxFile({ name: 'plan.docx', size: 10 }));
  const serverFailure = requestFailedMessage({ subject: UPLOAD_SUBJECT, status: HttpStatus.InternalServerError });
  expect(await screen.findByRole('alert')).toHaveTextContent(serverFailure);
  await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText(FILE_INPUT_LABEL), new File(['x'], 'plan.pdf'));
  expect(screen.getByRole('alert')).toHaveTextContent(NOT_A_DOCX_MESSAGE);
  expect(screen.getAllByRole('alert')).toHaveLength(1);
});
