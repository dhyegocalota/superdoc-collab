import type { EditRunView } from '@superdoc-history/types';

export enum ViewerMessageKind {
  Ready = 'ready',
  Failed = 'failed',
  Highlight = 'highlight',
  Clear = 'clear',
  Exit = 'exit',
}

export type ViewerMessage =
  | { kind: ViewerMessageKind.Ready }
  | { kind: ViewerMessageKind.Failed }
  | { kind: ViewerMessageKind.Highlight; runs: EditRunView[] }
  | { kind: ViewerMessageKind.Clear }
  | { kind: ViewerMessageKind.Exit };

const VIEWER_MESSAGE_KINDS: string[] = Object.values(ViewerMessageKind);

export function readViewerMessage({ event, expectedSource }: { event: MessageEvent; expectedSource: MessageEventSource | null }): ViewerMessage | null {
  if (event.origin !== window.location.origin) return null;
  if (event.source !== expectedSource) return null;
  const data: { kind?: unknown } | null = event.data;
  if (!data || !VIEWER_MESSAGE_KINDS.includes(String(data.kind))) return null;
  return event.data;
}
