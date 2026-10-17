import { createHash } from 'node:crypto';

const TOKEN_DIGEST = 'sha256';

export function hashToken(token: string): string {
  return createHash(TOKEN_DIGEST).update(token).digest('hex');
}
