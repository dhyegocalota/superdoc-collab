import { expect, test } from 'vitest';
import { discardLocalFile, keepLocalFile, localFileOf } from './local-file-store';

const FIRST_DOCUMENT_ID = 'doc-1';
const SECOND_DOCUMENT_ID = 'doc-2';

function fileNamed(name: string): File {
  return new File([new Uint8Array(1)], name);
}

test('a kept file is returned for its document and not for another', () => {
  const file = fileNamed('plan.docx');
  keepLocalFile({ documentId: FIRST_DOCUMENT_ID, file });
  expect(localFileOf(FIRST_DOCUMENT_ID)).toBe(file);
  expect(localFileOf(SECOND_DOCUMENT_ID)).toBeNull();
});

test('keeping a second file replaces the first, so one file is held at a time', () => {
  keepLocalFile({ documentId: FIRST_DOCUMENT_ID, file: fileNamed('first.docx') });
  const second = fileNamed('second.docx');
  keepLocalFile({ documentId: SECOND_DOCUMENT_ID, file: second });
  expect(localFileOf(FIRST_DOCUMENT_ID)).toBeNull();
  expect(localFileOf(SECOND_DOCUMENT_ID)).toBe(second);
});

test('discarding drops the file', () => {
  keepLocalFile({ documentId: FIRST_DOCUMENT_ID, file: fileNamed('plan.docx') });
  discardLocalFile(FIRST_DOCUMENT_ID);
  expect(localFileOf(FIRST_DOCUMENT_ID)).toBeNull();
});

test('discarding another document leaves the kept file alone', () => {
  const file = fileNamed('plan.docx');
  keepLocalFile({ documentId: FIRST_DOCUMENT_ID, file });
  discardLocalFile(SECOND_DOCUMENT_ID);
  expect(localFileOf(FIRST_DOCUMENT_ID)).toBe(file);
});
