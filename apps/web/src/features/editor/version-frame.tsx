import { versionViewPagePath, type EditRunView, type VersionSummary } from '@superdoc-history/types';
import { useEffect, useRef, useState } from 'react';
import { VERSION_FRAME_TITLE } from '@/features/timeline/timeline-copy';
import { cn } from '@/lib/utils';
import { readViewerMessage, ViewerMessageKind } from './viewer-messages';

type Frame = { version: VersionSummary; isReady: boolean };

function framesAfterShowing({ frames, version }: { frames: Frame[]; version: VersionSummary | null }): Frame[] {
  if (version === null) return [];
  const existing = frames.findIndex((frame) => frame.version.sequence === version.sequence);
  if (existing >= 0) return frames.slice(0, existing + 1);
  return [...frames, { version, isReady: false }];
}

function framesAfterReady({ frames, sequence }: { frames: Frame[]; sequence: number }): Frame[] {
  const readyIndex = frames.findIndex((frame) => frame.version.sequence === sequence);
  if (readyIndex < 0) return frames;
  return frames.slice(readyIndex).map((frame) => ({ ...frame, isReady: frame.isReady || frame.version.sequence === sequence }));
}

type VersionFrameProps = { documentId: string; version: VersionSummary | null; requestedSequence: number | null; runs: EditRunView[]; onFailed: (sequence: number) => void };

export function VersionFrame({ documentId, version, requestedSequence, runs, onFailed }: VersionFrameProps) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const elements = useRef(new Map<number, HTMLIFrameElement>());
  const onFailedRef = useRef(onFailed);
  const isRequestedReady = frames.some((frame) => frame.isReady && frame.version.sequence === requestedSequence);

  useEffect(() => {
    setFrames((current) => framesAfterShowing({ frames: current, version }));
  }, [version]);

  useEffect(() => {
    onFailedRef.current = onFailed;
  }, [onFailed]);

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      elements.current.forEach((element, sequence) => {
        const message = readViewerMessage({ event, expectedSource: element.contentWindow });
        if (message?.kind === ViewerMessageKind.Ready) setFrames((current) => framesAfterReady({ frames: current, sequence }));
        if (message?.kind === ViewerMessageKind.Failed) onFailedRef.current(sequence);
      });
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!isRequestedReady || requestedSequence === null) return;
    const frameWindow = elements.current.get(requestedSequence)?.contentWindow;
    if (!frameWindow) return;
    if (runs.length === 0) {
      frameWindow.postMessage({ kind: ViewerMessageKind.Clear }, window.location.origin);
      return;
    }
    frameWindow.postMessage({ kind: ViewerMessageKind.Highlight, runs }, window.location.origin);
  }, [isRequestedReady, requestedSequence, runs]);

  return frames.map((frame) => (
    <iframe
      key={frame.version.sequence}
      ref={(element) => {
        if (!element) {
          elements.current.delete(frame.version.sequence);
          return;
        }
        elements.current.set(frame.version.sequence, element);
      }}
      title={VERSION_FRAME_TITLE}
      src={versionViewPagePath({ documentId, sequence: frame.version.sequence })}
      aria-hidden={!frame.isReady}
      className={cn('absolute inset-0 size-full border-0 bg-background', !frame.isReady && 'invisible')}
    />
  ));
}
