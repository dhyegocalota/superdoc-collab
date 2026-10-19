import { PASSWORD_RESET_TTL_MS, resetPasswordPagePath, type CreatedPasswordReset } from '@superdoc-collab/types';
import type { Auth } from '../auth/auth';

export class PasswordResetLinkNotCapturedError extends Error {
  constructor(userId: string) {
    super(`No password reset token was captured for user ${userId}.`);
  }
}

export class PasswordResetLinkCapture {
  private readonly tokens = new Map<string, string>();

  store({ userId, token }: { userId: string; token: string }): void {
    this.tokens.set(userId, token);
  }

  take(userId: string): string {
    const token = this.tokens.get(userId);
    this.tokens.delete(userId);
    if (token === undefined) throw new PasswordResetLinkNotCapturedError(userId);
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

  async create({ userId, email }: { userId: string; email: string }): Promise<CreatedPasswordReset> {
    const expiresAt = this.now() + PASSWORD_RESET_TTL_MS;
    await this.auth.api.requestPasswordReset({ body: { email } });
    const token = this.capture.take(userId);
    return { url: `${this.appOrigin}${resetPasswordPagePath(token)}`, expiresAt };
  }
}
