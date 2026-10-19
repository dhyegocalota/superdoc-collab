import { ConnectionState, THUMBNAIL_CAPTURE_DELAY_MS, THUMBNAIL_UPLOADS_ATTRIBUTE } from '@superdoc-collab/types';
import { useCallback, useEffect, useRef } from 'react';
import { PAGE_SELECTOR } from '@/features/versions/use-painted-pages-report';
import { captureThumbnail } from './capture-thumbnail';
import { sendThumbnailBeacon, uploadThumbnail } from './editor-api';

const PAGE_HIDE_EVENT = 'pagehide';
const SYNCED_STATES = [ConnectionState.Online, ConnectionState.Recovered];
const CAPTURE_FAILED_WARNING = 'The document thumbnail could not be captured.';

class ThumbnailPageMissingError extends Error {}

enum ThumbnailDelivery {
  Upload = 'upload',
  Beacon = 'beacon',
}

const DELIVER: Record<ThumbnailDelivery, (input: { documentId: string; blob: Blob }) => Promise<boolean>> = {
  [ThumbnailDelivery.Upload]: uploadThumbnail,
  [ThumbnailDelivery.Beacon]: async (input) => sendThumbnailBeacon(input),
};

type ThumbnailCaptureInput = {
  documentId: string;
  isReader: boolean;
  connectionState: ConnectionState;
  lastEditAt: number | null;
  editorContainer: HTMLElement | null;
};

export function useThumbnailCapture({ documentId, isReader, connectionState, lastEditAt, editorContainer }: ThumbnailCaptureInput): void {
  const isEnabled = !isReader && SYNCED_STATES.includes(connectionState) && editorContainer !== null;
  const isUpdatePending = useRef(false);
  const hasWarned = useRef(false);
  const uploadCount = useRef(0);

  const publish = useCallback(
    async (delivery: ThumbnailDelivery): Promise<void> => {
      if (!editorContainer) return;
      isUpdatePending.current = false;
      try {
        const page = editorContainer.querySelector<HTMLElement>(PAGE_SELECTOR);
        if (!page) throw new ThumbnailPageMissingError();
        const blob = await captureThumbnail(page);
        const isDelivered = await DELIVER[delivery]({ documentId, blob });
        if (!isDelivered) return;
        uploadCount.current += 1;
        editorContainer.setAttribute(THUMBNAIL_UPLOADS_ATTRIBUTE, String(uploadCount.current));
      } catch (error) {
        if (hasWarned.current) return;
        hasWarned.current = true;
        console.warn(CAPTURE_FAILED_WARNING, error);
      }
    },
    [documentId, editorContainer],
  );

  useEffect(() => {
    if (!isEnabled || lastEditAt === null) return;
    isUpdatePending.current = true;
    function publishWhenSettled(): void {
      if (isUpdatePending.current) void publish(ThumbnailDelivery.Upload);
    }
    const timer = setTimeout(publishWhenSettled, THUMBNAIL_CAPTURE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isEnabled, lastEditAt, publish]);

  useEffect(() => {
    if (!isEnabled) return;
    function publishWaitingUpdate(): void {
      if (isUpdatePending.current) void publish(ThumbnailDelivery.Beacon);
    }
    window.addEventListener(PAGE_HIDE_EVENT, publishWaitingUpdate);
    return () => window.removeEventListener(PAGE_HIDE_EVENT, publishWaitingUpdate);
  }, [isEnabled, publish]);
}
