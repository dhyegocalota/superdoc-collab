import { AppRoute } from '@superdoc-collab/types';

const PROTOCOL_RELATIVE_PREFIX = '//';

export function safeNextPath(raw: string | null): string {
  if (!raw) return AppRoute.Documents;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return AppRoute.Documents;
    if (url.pathname.startsWith(PROTOCOL_RELATIVE_PREFIX)) return AppRoute.Documents;
    return url.pathname + url.search;
  } catch {
    return AppRoute.Documents;
  }
}
