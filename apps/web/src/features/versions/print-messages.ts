export enum PrintMessageKind {
  Ready = 'print-ready',
  Load = 'print-load',
  PageCount = 'print-page-count',
  Painted = 'print-painted',
  Failed = 'print-failed',
}

export type PrintMessage =
  | { kind: PrintMessageKind.Ready }
  | { kind: PrintMessageKind.Load; file: Blob }
  | { kind: PrintMessageKind.PageCount; pageCount: number }
  | { kind: PrintMessageKind.Painted }
  | { kind: PrintMessageKind.Failed };

const PRINT_MESSAGE_KINDS: string[] = Object.values(PrintMessageKind);

export function readPrintMessage({
  event,
  expectedSource,
}: {
  event: MessageEvent;
  expectedSource: MessageEventSource | null;
}): PrintMessage | null {
  if (event.origin !== window.location.origin) return null;
  if (event.source !== expectedSource) return null;
  const data: { kind?: unknown } | null = event.data;
  if (!data || !PRINT_MESSAGE_KINDS.includes(String(data.kind))) return null;
  return event.data;
}
