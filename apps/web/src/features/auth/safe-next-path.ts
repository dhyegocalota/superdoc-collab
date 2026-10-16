import { AppRoute } from '@superdoc-history/types';

export function safeNextPath(raw: string | null): string {
  if (!raw) return AppRoute.Documents;
  const isRelativePath = raw.startsWith('/') && !raw.startsWith('//');
  if (!isRelativePath) return AppRoute.Documents;
  return raw;
}
