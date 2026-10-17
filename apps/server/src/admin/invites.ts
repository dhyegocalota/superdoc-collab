import { randomBytes, randomUUID } from 'node:crypto';
import { INVITE_TTL_MS, inviteStateOf, signUpPagePath, type CreatedInvite, type InviteSummary } from '@superdoc-collab/types';
import { and, asc, desc, eq, gt, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import { hashToken } from '../auth/token-hash';
import type { AuthDatabase } from '../database/connection';
import { user } from '../database/schema/auth';
import { invites } from '../database/schema/invites';

const TOKEN_BYTES = 32;

export enum RevokeOutcome {
  Revoked = 'revoked',
  NotFound = 'not-found',
  AlreadyAccepted = 'already-accepted',
}

function timeOf(value: Date | null): number | null {
  if (value === null) return null;
  return value.getTime();
}

function acceptorOf(name: string | null): { name: string } | null {
  if (name === null) return null;
  return { name };
}

export class InvitesRepository {
  private readonly database: AuthDatabase;
  private readonly appOrigin: string;
  private readonly now: () => number;

  constructor({ database, appOrigin, now }: { database: AuthDatabase; appOrigin: string; now: () => number }) {
    this.database = database;
    this.appOrigin = appOrigin;
    this.now = now;
  }

  hasAnyUser(): boolean {
    return this.database.drizzle.select({ id: user.id }).from(user).limit(1).get() !== undefined;
  }

  create({ createdBy }: { createdBy: string }): CreatedInvite {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const createdAt = this.now();
    const expiresAt = createdAt + INVITE_TTL_MS;
    const id = randomUUID();
    this.database.drizzle
      .insert(invites)
      .values({ id, tokenHash: hashToken(token), createdBy, createdAt: new Date(createdAt), expiresAt: new Date(expiresAt) })
      .run();
    return { id, url: `${this.appOrigin}${signUpPagePath(token)}`, expiresAt };
  }

  resolvePending(token: string): { id: string } | null {
    const row = this.database.drizzle
      .select({ id: invites.id })
      .from(invites)
      .where(and(eq(invites.tokenHash, hashToken(token)), this.pendingCondition()))
      .get();
    if (!row) return null;
    return row;
  }

  accept({ id, userId }: { id: string; userId: string }): boolean {
    const result = this.database.drizzle
      .update(invites)
      .set({ acceptedBy: userId, acceptedAt: new Date(this.now()) })
      .where(and(eq(invites.id, id), this.pendingCondition()))
      .run();
    return result.changes === 1;
  }

  revoke(id: string): RevokeOutcome {
    const row = this.database.drizzle.select({ acceptedAt: invites.acceptedAt }).from(invites).where(eq(invites.id, id)).get();
    if (!row) return RevokeOutcome.NotFound;
    if (row.acceptedAt !== null) return RevokeOutcome.AlreadyAccepted;
    this.database.drizzle
      .update(invites)
      .set({ revokedAt: new Date(this.now()) })
      .where(eq(invites.id, id))
      .run();
    return RevokeOutcome.Revoked;
  }

  list(): InviteSummary[] {
    const creator = alias(user, 'creator');
    const acceptor = alias(user, 'acceptor');
    const now = this.now();
    return this.database.drizzle
      .select({
        id: invites.id,
        createdAt: invites.createdAt,
        expiresAt: invites.expiresAt,
        acceptedAt: invites.acceptedAt,
        revokedAt: invites.revokedAt,
        creatorName: creator.name,
        acceptorName: acceptor.name,
      })
      .from(invites)
      .innerJoin(creator, eq(creator.id, invites.createdBy))
      .leftJoin(acceptor, eq(acceptor.id, invites.acceptedBy))
      .orderBy(desc(invites.createdAt), asc(invites.id))
      .all()
      .map((row) => ({
        id: row.id,
        state: inviteStateOf({
          now,
          expiresAt: row.expiresAt.getTime(),
          acceptedAt: timeOf(row.acceptedAt),
          revokedAt: timeOf(row.revokedAt),
        }),
        createdAt: row.createdAt.getTime(),
        expiresAt: row.expiresAt.getTime(),
        createdBy: { name: row.creatorName },
        acceptedBy: acceptorOf(row.acceptorName),
      }));
  }

  private pendingCondition() {
    return and(isNull(invites.acceptedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date(this.now())));
  }
}
