import { AppRoute } from '@superdoc-history/types';

export function safeNextPath(raw: string | null): string {
  if (!raw) return AppRoute.Documents;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return AppRoute.Documents;
    return url.pathname + url.search;
  } catch {
    return AppRoute.Documents;
  }
}
