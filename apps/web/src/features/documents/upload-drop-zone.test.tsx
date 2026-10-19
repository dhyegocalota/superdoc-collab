import { DOCX_MIME_TYPE } from '@superdoc-collab/types';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import { CHOOSE_FILE_LABEL, DROP_ZONE_LABEL, DROP_ZONE_LIMIT, FILE_INPUT_LABEL, UPLOADING_MESSAGE } from './documents-copy';
import { bytesProgressDetail } from '@/features/open-progress/open-progress-copy';
import { UploadDropZone } from './upload-drop-zone';
import type { DocumentUpload } from './use-upload-document';

const ERROR_MESSAGE = 'Only .docx files can be uploaded.';

function uploadWith(overrides: Partial<DocumentUpload>): DocumentUpload {
  return { progress: null, uploadFiles: vi.fn(), clear: vi.fn(), message: null, isPending: false, ...overrides };
}

test('the zone invites a drop, states the limit and keeps the file input label', () => {
  renderWithProviders(<UploadDropZone upload={uploadWith({})} />);
  expect(screen.getByText(DROP_ZONE_LABEL)).toBeVisible();
  expect(screen.getByText(DROP_ZONE_LIMIT)).toBeVisible();
  expect(screen.getByLabelText(FILE_INPUT_LABEL)).toHaveAttribute('type', 'file');
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('Choose a file opens the file input', async () => {
  renderWithProviders(<UploadDropZone upload={uploadWith({})} />);
  const clickSpy = vi.spyOn(screen.getByLabelText(FILE_INPUT_LABEL), 'click');
  await userEvent.click(screen.getByRole('button', { name: CHOOSE_FILE_LABEL }));
  expect(clickSpy).toHaveBeenCalledTimes(1);
});

test('a chosen file is handed to the upload as a single-file list', async () => {
  const upload = uploadWith({});
  renderWithProviders(<UploadDropZone upload={upload} />);
  const file = new File(['x'], 'plan.docx', { type: DOCX_MIME_TYPE });
  await userEvent.setup({ applyAccept: false }).upload(screen.getByLabelText(FILE_INPUT_LABEL), file);
  expect(upload.uploadFiles).toHaveBeenCalledWith([file]);
});

test('while uploading the wait is announced with an indeterminate progress bar and the controls are disabled', () => {
  renderWithProviders(<UploadDropZone upload={uploadWith({ isPending: true })} />);
  expect(screen.getByRole('status')).toHaveTextContent(UPLOADING_MESSAGE);
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  expect(screen.getByLabelText(FILE_INPUT_LABEL)).toBeDisabled();
  expect(screen.getByRole('button', { name: CHOOSE_FILE_LABEL })).toBeDisabled();
});

test('the bytes sent fill the bar and name both sizes', () => {
  const progress = { sentBytes: 4_980_736, totalBytes: 9_961_472 };
  renderWithProviders(<UploadDropZone upload={uploadWith({ isPending: true, progress })} />);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  expect(screen.getByText(bytesProgressDetail({ doneBytes: progress.sentBytes, totalBytes: progress.totalBytes }))).toBeVisible();
});

test('a failure shows under the zone and the zone stays usable', () => {
  renderWithProviders(<UploadDropZone upload={uploadWith({ message: ERROR_MESSAGE })} />);
  expect(screen.getByRole('alert')).toHaveTextContent(ERROR_MESSAGE);
  expect(screen.getByLabelText(FILE_INPUT_LABEL)).toBeEnabled();
  expect(screen.getByRole('button', { name: CHOOSE_FILE_LABEL })).toBeEnabled();
});
