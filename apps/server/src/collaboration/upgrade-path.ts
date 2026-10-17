import { ApiPath } from '@superdoc-history/types';

const PARSE_BASE_URL = 'http://localhost';

export function upgradePathname(url: string): string {
  return new URL(url, PARSE_BASE_URL).pathname;
}

export function isAgentUpgrade(url: string): boolean {
  return upgradePathname(url) === ApiPath.AgentCollaboration;
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function isLoopbackAddress(address: string | undefined): boolean {
  return address !== undefined && LOOPBACK_ADDRESSES.has(address);
}
