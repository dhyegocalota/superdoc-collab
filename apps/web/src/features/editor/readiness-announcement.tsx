import type { DocumentReadiness } from './use-opened-document';

export function ReadinessAnnouncement(_props: { readiness: DocumentReadiness }) {
  return <p role="status" className="sr-only" />;
}
