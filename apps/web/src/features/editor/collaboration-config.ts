export const HOCUSPOCUS_PROVIDER = 'hocuspocus';
const HTTP_SCHEME = /^http/;

export function collaborationUrl(path: string): string {
  return `${window.location.origin.replace(HTTP_SCHEME, 'ws')}${path}`;
}
