import { DOCX_MIME_TYPE, NOT_A_DOCX_MESSAGE } from '@superdoc-collab/types';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { ErrorMessage } from '@/components/error-message';
import { renderWithProviders } from '@/testing/render-with-providers';
import { DROP_OVERLAY_LABEL, ONE_FILE_AT_A_TIME_MESSAGE } from './documents-copy';
import { UploadDropOverlay } from './upload-drop-overlay';
import { useUploadDocument } from './use-upload-document';

const FILES_DRAG = { types: ['Files'], files: [] as File[] };
const TEXT_DRAG = { types: ['text/plain'], files: [] as File[] };

function docx(name: string): File {
  return new File(['x'], name, { type: DOCX_MIME_TYPE });
}

function dropOf(files: File[]) {
  return { dataTransfer: { types: ['Files'], files } };
}

function Harness() {
  const upload = useUploadDocument();
  return (
    <>
      <div data-testid="child" />
      <UploadDropOverlay onFiles={upload.uploadFiles} />
      {upload.message !== null && <ErrorMessage>{upload.message}</ErrorMessage>}
    </>
  );
}

test('the overlay is hidden until a file is dragged over the page', () => {
  renderWithProviders(<UploadDropOverlay onFiles={vi.fn()} />);
  expect(screen.queryByText(DROP_OVERLAY_LABEL)).not.toBeInTheDocument();
  fireEvent.dragEnter(document.body, { dataTransfer: FILES_DRAG });
  expect(screen.getByText(DROP_OVERLAY_LABEL)).toBeVisible();
});

test('a drag that carries no files never shows the overlay', () => {
  renderWithProviders(<UploadDropOverlay onFiles={vi.fn()} />);
  fireEvent.dragEnter(document.body, { dataTransfer: TEXT_DRAG });
  expect(screen.queryByText(DROP_OVERLAY_LABEL)).not.toBeInTheDocument();
});

test('leaving to a child element keeps the overlay and leaving the page hides it', () => {
  renderWithProviders(<Harness />);
  const child = screen.getByTestId('child');
  fireEvent.dragEnter(document.body, { dataTransfer: FILES_DRAG });
  fireEvent.dragEnter(child, { dataTransfer: FILES_DRAG });
  fireEvent.dragLeave(document.body, { dataTransfer: FILES_DRAG, relatedTarget: child });
  expect(screen.getByText(DROP_OVERLAY_LABEL)).toBeVisible();
  fireEvent.dragLeave(child, { dataTransfer: FILES_DRAG, relatedTarget: document.body });
  expect(screen.queryByText(DROP_OVERLAY_LABEL)).not.toBeInTheDocument();
});

test('a drop hands the files over, hides the overlay and cancels the browser default', () => {
  const onFiles = vi.fn();
  renderWithProviders(<UploadDropOverlay onFiles={onFiles} />);
  const file = docx('plan.docx');
  fireEvent.dragEnter(document.body, { dataTransfer: FILES_DRAG });
  const notCancelled = fireEvent.drop(document.body, dropOf([file]));
  expect(notCancelled).toBe(false);
  expect(onFiles).toHaveBeenCalledWith([file]);
  expect(screen.queryByText(DROP_OVERLAY_LABEL)).not.toBeInTheDocument();
});

test('a drop that carries no files is left alone', () => {
  const onFiles = vi.fn();
  renderWithProviders(<UploadDropOverlay onFiles={onFiles} />);
  const notCancelled = fireEvent.drop(document.body, { dataTransfer: TEXT_DRAG });
  expect(notCancelled).toBe(true);
  expect(onFiles).not.toHaveBeenCalled();
});

test('dragend and the pointer leaving the window reset a stuck overlay', () => {
  renderWithProviders(<UploadDropOverlay onFiles={vi.fn()} />);
  fireEvent.dragEnter(document.body, { dataTransfer: FILES_DRAG });
  fireEvent.dragEnd(document.body);
  expect(screen.queryByText(DROP_OVERLAY_LABEL)).not.toBeInTheDocument();
  fireEvent.dragEnter(document.body, { dataTransfer: FILES_DRAG });
  fireEvent.mouseLeave(document.documentElement);
  expect(screen.queryByText(DROP_OVERLAY_LABEL)).not.toBeInTheDocument();
});

function showOverlay(): void {
  fireEvent.dragEnter(document.body, { dataTransfer: FILES_DRAG });
  expect(screen.getByText(DROP_OVERLAY_LABEL)).toBeVisible();
}

test('Escape hides the overlay', () => {
  renderWithProviders(<UploadDropOverlay onFiles={vi.fn()} />);
  showOverlay();
  fireEvent.keyDown(document.body, { key: 'Escape' });
  expect(screen.queryByText(DROP_OVERLAY_LABEL)).not.toBeInTheDocument();
});

test('a dragleave whose pointer left the window hides the overlay even when enters outnumber leaves', () => {
  renderWithProviders(<Harness />);
  showOverlay();
  fireEvent.dragEnter(screen.getByTestId('child'), { dataTransfer: FILES_DRAG });
  fireEvent.dragLeave(document.body, { dataTransfer: FILES_DRAG, relatedTarget: null });
  expect(screen.queryByText(DROP_OVERLAY_LABEL)).not.toBeInTheDocument();
});

test('a drop that carries no files still hides the overlay', () => {
  renderWithProviders(<UploadDropOverlay onFiles={vi.fn()} />);
  showOverlay();
  fireEvent.drop(screen.getByText(DROP_OVERLAY_LABEL), { dataTransfer: TEXT_DRAG });
  expect(screen.queryByText(DROP_OVERLAY_LABEL)).not.toBeInTheDocument();
});

test('a pointer move with no button pressed hides a stuck overlay, because a cancelled drag sends no dragend', () => {
  renderWithProviders(<UploadDropOverlay onFiles={vi.fn()} />);
  showOverlay();
  fireEvent(document.body, new MouseEvent('pointermove', { bubbles: true, buttons: 0 }));
  expect(screen.queryByText(DROP_OVERLAY_LABEL)).not.toBeInTheDocument();
});

test('the overlay stops listening when it unmounts', () => {
  const onFiles = vi.fn();
  renderWithProviders(<UploadDropOverlay onFiles={onFiles} />);
  cleanup();
  fireEvent.drop(document.body, dropOf([docx('plan.docx')]));
  expect(onFiles).not.toHaveBeenCalled();
});

test('dropping two files shows the one-at-a-time message', () => {
  renderWithProviders(<Harness />);
  fireEvent.drop(document.body, dropOf([docx('a.docx'), docx('b.docx')]));
  expect(screen.getByRole('alert')).toHaveTextContent(ONE_FILE_AT_A_TIME_MESSAGE);
});

test('dropping a pdf shows the docx-only message', () => {
  renderWithProviders(<Harness />);
  fireEvent.drop(document.body, dropOf([new File(['x'], 'report.pdf')]));
  expect(screen.getByRole('alert')).toHaveTextContent(NOT_A_DOCX_MESSAGE);
});
