import { expect, test } from 'vitest';
import { DownloadFormat } from './download-format';

test('DownloadFormat lists Docx and Pdf', () => {
  expect(Object.values(DownloadFormat)).toEqual(['docx', 'pdf']);
});
