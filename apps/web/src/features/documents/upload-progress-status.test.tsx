import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { bytesProgressDetail } from '@/features/open-progress/open-progress-copy';
import { UPLOADING_MESSAGE } from './documents-copy';
import { UploadProgressStatus } from './upload-progress-status';

const PROGRESS = { sentBytes: 2_490_368, totalBytes: 9_961_472 };

test('before the first byte count it announces the upload on an indeterminate bar with no numbers', () => {
  render(<UploadProgressStatus progress={null} />);
  expect(screen.getByRole('status')).toHaveTextContent(UPLOADING_MESSAGE);
  expect(screen.getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
  expect(screen.queryByText(/ of /)).not.toBeInTheDocument();
});

test('the bytes sent give a determinate bar and a line naming both sizes', () => {
  render(<UploadProgressStatus progress={PROGRESS} />);
  const bar = screen.getByRole('progressbar');
  expect(bar).toHaveAttribute('aria-valuenow', '25');
  const detail = bytesProgressDetail({ doneBytes: PROGRESS.sentBytes, totalBytes: PROGRESS.totalBytes });
  expect(bar).toHaveAttribute('aria-valuetext', detail);
  expect(screen.getByText(detail)).toBeVisible();
});
