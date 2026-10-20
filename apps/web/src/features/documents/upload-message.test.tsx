import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { DeviceRefusal } from '@/features/local-preview/device-guard';
import { DEVICE_OFFER_LABEL, DEVICE_REFUSAL_COPY } from '@/features/local-preview/local-preview-copy';
import { renderWithProviders } from '@/testing/render-with-providers';
import { UploadMessage } from './upload-message';
import type { DocumentUpload } from './use-upload-document';

const MESSAGE = 'This server can prepare documents with up to 4 MB of text and layout.';

function uploadWith(overrides: Partial<DocumentUpload>): DocumentUpload {
  return { progress: null, uploadFiles: vi.fn(), clear: vi.fn(), message: null, isPending: false, devicePreparation: null, ...overrides };
}

test('shows nothing when there is no message', () => {
  renderWithProviders(<UploadMessage upload={uploadWith({})} />);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

test('shows the message alone when no device can prepare the file', () => {
  renderWithProviders(<UploadMessage upload={uploadWith({ message: MESSAGE })} />);
  expect(screen.getByRole('alert')).toHaveTextContent(MESSAGE);
  expect(screen.queryByRole('button', { name: DEVICE_OFFER_LABEL })).not.toBeInTheDocument();
});

test('offers to prepare on this device and starts it on a click', async () => {
  const start = vi.fn();
  renderWithProviders(<UploadMessage upload={uploadWith({ message: MESSAGE, devicePreparation: { refusal: null, start } })} />);
  await userEvent.click(screen.getByRole('button', { name: DEVICE_OFFER_LABEL }));
  expect(start).toHaveBeenCalledTimes(1);
});

test.each(Object.values(DeviceRefusal))('a device refused for %s names the reason and offers no button', (refusal) => {
  renderWithProviders(<UploadMessage upload={uploadWith({ message: MESSAGE, devicePreparation: { refusal, start: vi.fn() } })} />);
  expect(screen.getByText(DEVICE_REFUSAL_COPY[refusal])).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: DEVICE_OFFER_LABEL })).not.toBeInTheDocument();
});
