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

export function VersionFrame({ documentId, version, runs }: { documentId: string; version: VersionSummary | null; runs: EditRunView[] }) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const elements = useRef(new Map<number, HTMLIFrameElement>());
  const readySequence = frames.findLast((frame) => frame.isReady)?.version.sequence;

  useEffect(() => {
    setFrames((current) => framesAfterShowing({ frames: current, version }));
  }, [version]);

  useEffect(() => {
    function handleMessage(event: MessageEvent): void {
      const ready = frames.find((frame) => {
        const frameWindow = elements.current.get(frame.version.sequence)?.contentWindow;
        if (!frameWindow) return false;
        return readViewerMessage({ event, expectedSource: frameWindow })?.kind === ViewerMessageKind.Ready;
      });
      if (!ready) return;
      setFrames((current) => framesAfterReady({ frames: current, sequence: ready.version.sequence }));
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [frames]);

  useEffect(() => {
    if (readySequence === undefined) return;
    const frameWindow = elements.current.get(readySequence)?.contentWindow;
    if (!frameWindow) return;
    if (runs.length === 0) {
      frameWindow.postMessage({ kind: ViewerMessageKind.Clear }, window.location.origin);
      return;
    }
    frameWindow.postMessage({ kind: ViewerMessageKind.Highlight, runs }, window.location.origin);
  }, [readySequence, runs]);

  return frames.map((frame) => (
    <iframe
      key={frame.version.sequence}
      ref={(element) => {
        if (element) elements.current.set(frame.version.sequence, element);
      }}
      title={VERSION_FRAME_TITLE}
      src={versionViewPagePath({ documentId, sequence: frame.version.sequence })}
      aria-hidden={!frame.isReady}
      className={cn('absolute inset-0 size-full border-0 bg-background', !frame.isReady && 'invisible')}
    />
  ));
}
