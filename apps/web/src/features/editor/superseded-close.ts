import type { TransportReport } from './use-connection-state';

export type CloseEvent = { code: number; reason: string };

export function supersededReportOf(event: CloseEvent): TransportReport | null {
  throw new Error('supersededReportOf is not implemented');
}
