import type { ApiPath } from '@superdoc-history/types';

export function apiGet(path: ApiPath): Promise<Response> {
  return fetch(path, { credentials: 'same-origin' });
}
