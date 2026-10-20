import { TAB_QUERY_KEY } from '@superdoc-collab/types';
import { tabId } from '@/lib/tab-id';

export const HOCUSPOCUS_PROVIDER = 'hocuspocus';
const HTTP_SCHEME = /^http/;

export function collaborationUrl(path: string): string {
  const url = `${window.location.origin.replace(HTTP_SCHEME, 'ws')}${path}`;
  return `${url}?${new URLSearchParams({ [TAB_QUERY_KEY]: tabId() })}`;
}
