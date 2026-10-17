import { versionViewPagePath, type EditRunView, type VersionSummary } from '@superdoc-collab/types';
import { useEffect, useRef, useState } from 'react';
import { VERSION_FRAME_TITLE } from '@/features/timeline/timeline-copy';
import { useWindowMessage } from '@/lib/use-window-message';
import { cn } from '@/lib/utils';
import { readViewerMessage, ViewerMessageKind } from './viewer-messages';

type Frame = { version: VersionSummary; isReady: boolean };

function framesAfterShowing({ frames, version }: { frames: Frame[]; version: VersionSummary | null }): Frame[] {
  if (version === null) return [];
  const existingIndex = frames.findIndex((frame) => frame.version.sequence === version.sequence);
  if (existingIndex >= 0) return frames.slice(0, existingIndex + 1);
  return [...frames, { version, isReady: false }];
}

function framesAfterReady({ frames, sequence }: { frames: Frame[]; sequence: number }): Frame[] {
  const readyIndex = frames.findIndex((frame) => frame.version.sequence === sequence);
  if (readyIndex < 0) return frames;
  return frames.slice(readyIndex).map((frame) => ({ ...frame, isReady: frame.isReady || frame.version.sequence === sequence }));
}

type VersionFrameProps = {
  documentId: string;
  version: VersionSummary | null;
  requestedSequence: number | null;
  runs: EditRunView[];
  onFailed: (sequence: number) => void;
  onExit: () => void;
};

export function VersionFrame({ documentId, version, requestedSequence, runs, onFailed, onExit }: VersionFrameProps) {
  const [frames, setFrames] = useState<Frame[]>([]);
  const elements = useRef(new Map<number, HTMLIFrameElement>());
  const isRequestedReady = frames.some((frame) => frame.isReady && frame.version.sequence === requestedSequence);

  useEffect(() => {
    setFrames((current) => framesAfterShowing({ frames: current, version }));
  }, [version]);

  useWindowMessage((event) => {
    elements.current.forEach((element, sequence) => {
      const message = readViewerMessage({ event, expectedSource: element.contentWindow });
      if (message === null) return;
      if (message.kind === ViewerMessageKind.Ready) setFrames((current) => framesAfterReady({ frames: current, sequence }));
      if (message.kind === ViewerMessageKind.Failed) onFailed(sequence);
      if (message.kind === ViewerMessageKind.Exit) onExit();
    });
  });

  function registerFrame(sequence: number): (element: HTMLIFrameElement | null) => void {
    return function setFrameElement(element: HTMLIFrameElement | null): void {
      if (!element) {
        elements.current.delete(sequence);
        return;
      }
      elements.current.set(sequence, element);
    };
  }

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
      ref={registerFrame(frame.version.sequence)}
      title={VERSION_FRAME_TITLE}
      src={versionViewPagePath({ documentId, sequence: frame.version.sequence })}
      aria-hidden={!frame.isReady}
      className={cn('absolute inset-0 size-full border-0 bg-background', !frame.isReady && 'invisible')}
    />
  ));
}
