import { ConnectionState, THUMBNAIL_CAPTURE_DELAY_MS, THUMBNAIL_UPLOADS_ATTRIBUTE, ThumbnailMimeType } from '@superdoc-collab/types';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { DOCUMENT_ID } from '@/testing/opened-document';
import { captureThumbnail } from './capture-thumbnail';
import { sendThumbnailBeacon, uploadThumbnail } from './editor-api';
import { useThumbnailCapture } from './use-thumbnail-capture';

vi.mock('./capture-thumbnail', () => ({ captureThumbnail: vi.fn(), ThumbnailTooLargeError: class extends Error {} }));
vi.mock('./editor-api', () => ({ uploadThumbnail: vi.fn(), sendThumbnailBeacon: vi.fn() }));

const PAGE_HIDE = 'pagehide';
const ONE_MS = 1;
const FIVE_SECONDS_MS = 5000;
const IMAGE = new Blob([new Uint8Array([1, 2, 3])], { type: ThumbnailMimeType.WebP });

type Input = Parameters<typeof useThumbnailCapture>[0];

function containerWithPage(): HTMLElement {
  const container = document.createElement('div');
  const page = document.createElement('div');
  page.className = 'superdoc-page';
  container.append(page);
  return container;
}

function render(overrides: Partial<Input> = {}) {
  const editorContainer = containerWithPage();
  const initialProps: Input = {
    documentId: DOCUMENT_ID,
    isReader: false,
    connectionState: ConnectionState.Online,
    lastEditAt: null,
    editorContainer,
    ...overrides,
  };
  return { editorContainer, ...renderHook((props: Input) => useThumbnailCapture(props), { initialProps }) };
}

async function advance(milliseconds: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(milliseconds);
  });
}

async function hidePage(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event(PAGE_HIDE));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(captureThumbnail).mockReset().mockResolvedValue(IMAGE);
  vi.mocked(uploadThumbnail).mockReset().mockResolvedValue(true);
  vi.mocked(sendThumbnailBeacon).mockReset().mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('one capture is uploaded the delay after the last editor update and counted on the container', async () => {
  const { editorContainer, rerender } = render();
  rerender({ documentId: DOCUMENT_ID, isReader: false, connectionState: ConnectionState.Online, lastEditAt: 1, editorContainer });
  await advance(THUMBNAIL_CAPTURE_DELAY_MS - ONE_MS);
  expect(captureThumbnail).not.toHaveBeenCalled();
  await advance(ONE_MS);
  expect(captureThumbnail).toHaveBeenCalledWith(editorContainer.querySelector('.superdoc-page'));
  expect(uploadThumbnail).toHaveBeenCalledTimes(1);
  expect(uploadThumbnail).toHaveBeenCalledWith({ documentId: DOCUMENT_ID, blob: IMAGE });
  expect(editorContainer.getAttribute(THUMBNAIL_UPLOADS_ATTRIBUTE)).toBe('1');
});

test('a later editor update restarts the delay', async () => {
  const { editorContainer, rerender } = render();
  const update = (lastEditAt: number) =>
    rerender({ documentId: DOCUMENT_ID, isReader: false, connectionState: ConnectionState.Online, lastEditAt, editorContainer });
  update(1);
  await advance(FIVE_SECONDS_MS);
  update(2);
  await advance(THUMBNAIL_CAPTURE_DELAY_MS - ONE_MS);
  expect(captureThumbnail).not.toHaveBeenCalled();
  await advance(ONE_MS);
  expect(uploadThumbnail).toHaveBeenCalledTimes(1);
});

test('a reader never captures, uploads or sends a beacon', async () => {
  const { editorContainer, rerender } = render({ isReader: true });
  rerender({ documentId: DOCUMENT_ID, isReader: true, connectionState: ConnectionState.Online, lastEditAt: 1, editorContainer });
  await advance(THUMBNAIL_CAPTURE_DELAY_MS);
  await hidePage();
  expect(captureThumbnail).not.toHaveBeenCalled();
  expect(uploadThumbnail).not.toHaveBeenCalled();
  expect(sendThumbnailBeacon).not.toHaveBeenCalled();
});

test.each([ConnectionState.Lost, ConnectionState.Reconnecting, ConnectionState.Failed])(
  'nothing is captured while %s',
  async (connectionState) => {
    const { editorContainer, rerender } = render({ connectionState });
    rerender({ documentId: DOCUMENT_ID, isReader: false, connectionState, lastEditAt: 1, editorContainer });
    await advance(THUMBNAIL_CAPTURE_DELAY_MS);
    expect(captureThumbnail).not.toHaveBeenCalled();
  },
);

test('leaving the page with an update still waiting sends the capture as a beacon, once', async () => {
  const { editorContainer, rerender } = render();
  rerender({ documentId: DOCUMENT_ID, isReader: false, connectionState: ConnectionState.Online, lastEditAt: 1, editorContainer });
  await hidePage();
  await hidePage();
  expect(sendThumbnailBeacon).toHaveBeenCalledTimes(1);
  expect(sendThumbnailBeacon).toHaveBeenCalledWith({ documentId: DOCUMENT_ID, blob: IMAGE });
  expect(uploadThumbnail).not.toHaveBeenCalled();
  await advance(THUMBNAIL_CAPTURE_DELAY_MS);
  expect(uploadThumbnail).not.toHaveBeenCalled();
});

test('leaving the page sends nothing when no update is waiting', async () => {
  const { editorContainer, rerender } = render();
  await hidePage();
  expect(sendThumbnailBeacon).not.toHaveBeenCalled();
  rerender({ documentId: DOCUMENT_ID, isReader: false, connectionState: ConnectionState.Online, lastEditAt: 1, editorContainer });
  await advance(THUMBNAIL_CAPTURE_DELAY_MS);
  await hidePage();
  expect(sendThumbnailBeacon).not.toHaveBeenCalled();
});

test('a capture that fails warns once and the next update tries again', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.mocked(captureThumbnail).mockRejectedValue(new Error('tainted canvas'));
  const { editorContainer, rerender } = render();
  const update = (lastEditAt: number) =>
    rerender({ documentId: DOCUMENT_ID, isReader: false, connectionState: ConnectionState.Online, lastEditAt, editorContainer });
  update(1);
  await advance(THUMBNAIL_CAPTURE_DELAY_MS);
  update(2);
  await advance(THUMBNAIL_CAPTURE_DELAY_MS);
  expect(captureThumbnail).toHaveBeenCalledTimes(2);
  expect(warning).toHaveBeenCalledTimes(1);
  expect(uploadThumbnail).not.toHaveBeenCalled();
});

test('a refused upload leaves the container uncounted and is not retried before the next update', async () => {
  vi.mocked(uploadThumbnail).mockResolvedValue(false);
  const { editorContainer, rerender } = render();
  rerender({ documentId: DOCUMENT_ID, isReader: false, connectionState: ConnectionState.Online, lastEditAt: 1, editorContainer });
  await advance(THUMBNAIL_CAPTURE_DELAY_MS * 3);
  expect(uploadThumbnail).toHaveBeenCalledTimes(1);
  expect(editorContainer.hasAttribute(THUMBNAIL_UPLOADS_ATTRIBUTE)).toBe(false);
});

test('a container without a page warns instead of throwing', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const editorContainer = document.createElement('div');
  const { rerender } = render({ editorContainer });
  rerender({ documentId: DOCUMENT_ID, isReader: false, connectionState: ConnectionState.Online, lastEditAt: 1, editorContainer });
  await advance(THUMBNAIL_CAPTURE_DELAY_MS);
  expect(captureThumbnail).not.toHaveBeenCalled();
  expect(warning).toHaveBeenCalledTimes(1);
});
