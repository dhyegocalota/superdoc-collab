import { ARCHIVED_REASON } from '@superdoc-collab/types';
import type { Auth } from '../auth/auth';
import { revokeOAuthGrantsOf } from '../auth/consent-revocation';
import type { AuthDatabase } from '../database/connection';

export class UserAccess {
  private readonly auth: Auth;
  private readonly database: AuthDatabase;
  private readonly closeConnectionsOfUser: (userId: string) => void;

  constructor({
    auth,
    database,
    closeConnectionsOfUser,
  }: {
    auth: Auth;
    database: AuthDatabase;
    closeConnectionsOfUser: (userId: string) => void;
  }) {
    this.auth = auth;
    this.database = database;
    this.closeConnectionsOfUser = closeConnectionsOfUser;
  }

  async archive({ userId, headers }: { userId: string; headers: Headers }): Promise<void> {
    await this.auth.api.banUser({ headers, body: { userId, banReason: ARCHIVED_REASON } });
    revokeOAuthGrantsOf({ database: this.database, userId });
    this.closeConnectionsOfUser(userId);
  }

  async restore({ userId, headers }: { userId: string; headers: Headers }): Promise<void> {
    await this.auth.api.unbanUser({ headers, body: { userId } });
  }

  async impersonate({ userId, headers }: { userId: string; headers: Headers }): Promise<Headers> {
    const impersonation = await this.auth.api.impersonateUser({ headers, body: { userId }, returnHeaders: true });
    return impersonation.headers;
  }
}
