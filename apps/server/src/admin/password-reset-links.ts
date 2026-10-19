import { randomUUID } from 'node:crypto';
import { PASSWORD_RESET_TTL_MS, resetPasswordPagePath, type CreatedPasswordReset } from '@superdoc-collab/types';
import type { Auth } from '../auth/auth';

const NONCE_QUERY_PARAMETER = 'callbackURL';

export function resetNonceOf(url: string): string {
  const nonce = new URL(url).searchParams.get(NONCE_QUERY_PARAMETER);
  if (!nonce) throw new PasswordResetNonceMissingError();
  return nonce;
}

export class PasswordResetNonceMissingError extends Error {
  constructor() {
    super('The password reset callback carries no request nonce.');
  }
}

export class PasswordResetLinkNotCapturedError extends Error {
  constructor(nonce: string) {
    super(`No password reset token was captured for request ${nonce}.`);
  }
}

export class PasswordResetLinkCapture {
  private readonly tokens = new Map<string, string>();

  store({ nonce, token }: { nonce: string; token: string }): void {
    this.tokens.set(nonce, token);
  }

  take(nonce: string): string {
    const token = this.tokens.get(nonce);
    this.tokens.delete(nonce);
    if (token === undefined) throw new PasswordResetLinkNotCapturedError(nonce);
    return token;
  }
}

export class PasswordResets {
  private readonly auth: Auth;
  private readonly capture: PasswordResetLinkCapture;
  private readonly appOrigin: string;
  private readonly now: () => number;

  constructor({ auth, capture, appOrigin, now }: { auth: Auth; capture: PasswordResetLinkCapture; appOrigin: string; now: () => number }) {
    this.auth = auth;
    this.capture = capture;
    this.appOrigin = appOrigin;
    this.now = now;
  }

  async create({ email }: { email: string }): Promise<CreatedPasswordReset> {
    const expiresAt = this.now() + PASSWORD_RESET_TTL_MS;
    const nonce = randomUUID();
    await this.auth.api.requestPasswordReset({ body: { email, redirectTo: nonce } });
    const token = this.capture.take(nonce);
    return { url: `${this.appOrigin}${resetPasswordPagePath(token)}`, expiresAt };
  }
}
