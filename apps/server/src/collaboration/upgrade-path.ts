import { ApiPath } from '@superdoc-history/types';

const PARSE_BASE_URL = 'http://localhost';

export function upgradePathname(url: string): string {
  return new URL(url, PARSE_BASE_URL).pathname;
}

export function isAgentUpgrade(url: string): boolean {
  return upgradePathname(url) === ApiPath.AgentCollaboration;
}
