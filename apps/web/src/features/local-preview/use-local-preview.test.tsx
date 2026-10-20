import { renderHook } from '@testing-library/react';
import { expect, test } from 'vitest';
import { DocumentReadiness } from '@/features/editor/use-opened-document';
import { keepLocalFile, localFileOf } from './local-file-store';
import { useLocalPreview } from './use-local-preview';

const DOCUMENT_ID = 'doc-1';
const FILE = new File([new Uint8Array(1)], 'plan.docx');

function previewAt(readiness: DocumentReadiness) {
  return renderHook(
    ({ current, isPainted }) => useLocalPreview({ documentId: DOCUMENT_ID, readiness: current, isLiveEditorPainted: isPainted }),
    { initialProps: { current: readiness, isPainted: false } },
  );
}

test('shows the kept file while the document is waiting', () => {
  keepLocalFile({ documentId: DOCUMENT_ID, file: FILE });
  expect(previewAt(DocumentReadiness.Waiting).result.current).toBe(FILE);
});

test('shows nothing when no file was kept', () => {
  keepLocalFile({ documentId: 'another-document', file: FILE });
  expect(previewAt(DocumentReadiness.Waiting).result.current).toBeNull();
});

test('keeps the file while the first answer is still on its way', () => {
  keepLocalFile({ documentId: DOCUMENT_ID, file: FILE });
  expect(previewAt(DocumentReadiness.Opening).result.current).toBeNull();
  expect(localFileOf(DOCUMENT_ID)).toBe(FILE);
});

test.each([DocumentReadiness.Ready, DocumentReadiness.Failed, DocumentReadiness.Unavailable])(
  'drops the file once the page is %s',
  (readiness) => {
    keepLocalFile({ documentId: DOCUMENT_ID, file: FILE });
    const { result } = previewAt(readiness);
    expect(result.current).toBeNull();
    expect(localFileOf(DOCUMENT_ID)).toBeNull();
  },
);

test('swapping to Ready after waiting keeps the file until the live editor has painted, then drops it for good', () => {
  keepLocalFile({ documentId: DOCUMENT_ID, file: FILE });
  const { result, rerender } = previewAt(DocumentReadiness.Waiting);
  expect(result.current).toBe(FILE);
  rerender({ current: DocumentReadiness.Ready, isPainted: false });
  expect(result.current).toBe(FILE);
  expect(localFileOf(DOCUMENT_ID)).toBe(FILE);
  rerender({ current: DocumentReadiness.Ready, isPainted: true });
  expect(result.current).toBeNull();
  expect(localFileOf(DOCUMENT_ID)).toBeNull();
});
