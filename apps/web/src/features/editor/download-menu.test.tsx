import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { renderWithProviders } from '@/testing/render-with-providers';
import { DOWNLOAD_BUTTON_LABEL, DOWNLOAD_LABEL, DOWNLOAD_OPTIONS_LABEL, DOWNLOAD_PDF_LABEL } from './editor-copy';
import { DownloadFormat } from './download-format';
import { DownloadMenu } from './download-menu';

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
