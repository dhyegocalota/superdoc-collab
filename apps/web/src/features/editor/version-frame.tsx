import { versionViewPagePath, type EditRunView, type VersionSummary } from '@superdoc-history/types';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { readViewerMessage, ViewerMessageKind } from './viewer-messages';

export const VERSION_FRAME_TITLE = 'Document version';

type Frame = { version: VersionSummary; isReady: boolean };

function framesAfterShowing({ frames, version }: { frames: Frame[]; version: VersionSummary | null }): Frame[] {
  if (version === null) return [];
  const existing = frames.findIndex((frame) => frame.version.sequence === version.sequence);
  if (existing >= 0) return frames.slice(0, existing + 1);
  return [...frames, { version, isReady: false }];
}

function framesAfterReady({ frames, sequence }: { frames: Frame[]; sequence: number }): Frame[] {
  const readyIndex = frames.findIndex((frame) => frame.version.sequence === sequence);
  return frames.slice(readyIndex).map((frame) => ({ ...frame, isReady: frame.isReady || frame.version.sequence === sequence }));
}

type VersionFrameProps = { documentId: string; version: VersionSummary | null; requestedSequence: number | null; runs: EditRunView[]; onFailed: (sequence: number) => void };

export function VersionFrame({ documentId, version, requestedSequence, runs, onFailed }: VersionFrameProps) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const elements = useRef(new Map<number, HTMLIFrameElement>());
  const isRequestedReady = frames.some((frame) => frame.isReady && frame.version.sequence === requestedSequence);

  useEffect(() => {
    setFrames((current) => framesAfterShowing({ frames: current, version }));
  }, [version]);

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      frames.forEach((frame) => {
        const frameWindow = elements.current.get(frame.version.sequence)?.contentWindow;
        if (!frameWindow) return;
        const message = readViewerMessage({ event, expectedSource: frameWindow });
        if (message?.kind === ViewerMessageKind.Ready) setFrames((current) => framesAfterReady({ frames: current, sequence: frame.version.sequence }));
        if (message?.kind === ViewerMessageKind.Failed) onFailed(frame.version.sequence);
      });
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [frames, onFailed]);

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
