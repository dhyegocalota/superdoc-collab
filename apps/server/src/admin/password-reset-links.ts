export class PasswordResetLinkNotCapturedError extends Error {
  constructor(userId: string) {
    super(`No password reset token was captured for user ${userId}.`);
  }
}

export class PasswordResetLinkCapture {
  store(_entry: { userId: string; token: string }): void {
    throw new Error('PasswordResetLinkCapture.store is not implemented');
  }

  take(_userId: string): string {
    throw new Error('PasswordResetLinkCapture.take is not implemented');
  }
}
