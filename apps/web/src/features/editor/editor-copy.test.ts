import { expect, test } from 'vitest';
import { DownloadFormat } from './download-format';
import { DOWNLOAD_FORMAT_LABELS, DOWNLOAD_LABEL, DOWNLOAD_PDF_LABEL, goToCursorLabel } from './editor-copy';

test('pin: goToCursorLabel names the member with a typographic apostrophe', () => {
  expect(goToCursorLabel('Bruno')).toBe('Go to Bruno’s cursor');
});

test('pin: each download format has its menu label', () => {
  expect(DOWNLOAD_FORMAT_LABELS).toEqual({ [DownloadFormat.Docx]: DOWNLOAD_LABEL, [DownloadFormat.Pdf]: DOWNLOAD_PDF_LABEL });
});
