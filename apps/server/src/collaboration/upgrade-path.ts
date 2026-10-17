import { ApiPath } from '@superdoc-collab/types';

const PARSE_BASE_URL = 'http://localhost';
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function upgradePathname(url: string): string {
  return new URL(url, PARSE_BASE_URL).pathname;
}

export function isAgentUpgrade(url: string): boolean {
  return upgradePathname(url) === ApiPath.AgentCollaboration;
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (address === undefined) return false;
  return LOOPBACK_ADDRESSES.has(address);
}
