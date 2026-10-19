import { UserRole, type AdminUser } from '@superdoc-collab/types';
import { and, asc, eq } from 'drizzle-orm';
import type { AuthDatabase } from '../database/connection';
import { user } from '../database/schema/auth';

export enum SetRoleOutcome {
  Updated = 'updated',
  NotFound = 'not-found',
  LastAdmin = 'last-admin',
}

const ADMIN_USER_COLUMNS = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt,
  banned: user.banned,
};

function adminUserOf({
  banned,
  createdAt,
  ...row
}: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: Date;
  banned: boolean;
}): AdminUser {
  return { ...row, createdAt: createdAt.getTime(), isArchived: banned };
}

export class AdminUsersRepository {
  private readonly database: AuthDatabase;

  constructor(database: AuthDatabase) {
    this.database = database;
  }

  list(): AdminUser[] {
    return this.database.drizzle.select(ADMIN_USER_COLUMNS).from(user).orderBy(asc(user.createdAt), asc(user.id)).all().map(adminUserOf);
  }

  find(id: string): AdminUser | null {
    const row = this.database.drizzle.select(ADMIN_USER_COLUMNS).from(user).where(eq(user.id, id)).get();
    if (!row) return null;
    return adminUserOf(row);
  }

  countActiveAdmins(): number {
    return this.database.drizzle
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.role, UserRole.Admin), eq(user.banned, false)))
      .all().length;
  }

  emailOf(id: string): string | null {
    const row = this.database.drizzle.select({ email: user.email }).from(user).where(eq(user.id, id)).get();
    if (!row) return null;
    return row.email;
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
