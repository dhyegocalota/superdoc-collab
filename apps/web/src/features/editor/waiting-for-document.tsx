import { DocumentReadiness } from './use-opened-document';

export type WaitingReadiness =
  DocumentReadiness.Waiting | DocumentReadiness.Paused | DocumentReadiness.Failed | DocumentReadiness.Unavailable;

type WaitingForDocumentProps = {
  documentId: string;
  readiness: WaitingReadiness;
  onKeepWaiting: () => void;
  onRetry: () => void;
};

export function WaitingForDocument(_props: WaitingForDocumentProps): never {
  throw new Error('WaitingForDocument is not implemented');
}
