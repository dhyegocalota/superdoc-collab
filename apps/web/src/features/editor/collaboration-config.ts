import { TAB_QUERY_KEY } from '@superdoc-collab/types';
import { tabId } from '@/lib/tab-id';

export const HOCUSPOCUS_PROVIDER = 'hocuspocus';
const HTTP_SCHEME = /^http/;

export function collaborationUrl(path: string): string {
  return `${window.location.origin.replace(HTTP_SCHEME, 'ws')}${path}?${TAB_QUERY_KEY}=${tabId()}`;
}
