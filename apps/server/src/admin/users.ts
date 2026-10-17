import { UserRole, type AdminUser } from '@superdoc-collab/types';
import { asc, eq } from 'drizzle-orm';
import type { AuthDatabase } from '../database/connection';
import { user } from '../database/schema/auth';

export enum SetRoleOutcome {
  Updated = 'updated',
  NotFound = 'not-found',
  LastAdmin = 'last-admin',
}

export class AdminUsersRepository {
  private readonly database: AuthDatabase;

  constructor(database: AuthDatabase) {
    this.database = database;
  }

  list(): AdminUser[] {
    return this.database.drizzle
      .select({ id: user.id, name: user.name, email: user.email, role: user.role, createdAt: user.createdAt })
      .from(user)
      .orderBy(asc(user.createdAt), asc(user.id))
      .all()
      .map((row) => ({ ...row, createdAt: row.createdAt.getTime() }));
  }

  countAdmins(): number {
    return this.database.drizzle.select({ id: user.id }).from(user).where(eq(user.role, UserRole.Admin)).all().length;
  }

  setRole({ id, role }: { id: string; role: UserRole }): SetRoleOutcome {
    return this.database.drizzle.transaction((transaction) => {
      const row = transaction.select({ role: user.role }).from(user).where(eq(user.id, id)).get();
      if (!row) return SetRoleOutcome.NotFound;
      const demotesAnAdmin = row.role === UserRole.Admin && role === UserRole.User;
      if (demotesAnAdmin && this.countAdmins() === 1) return SetRoleOutcome.LastAdmin;
      transaction.update(user).set({ role }).where(eq(user.id, id)).run();
      return SetRoleOutcome.Updated;
    });
  }
}
