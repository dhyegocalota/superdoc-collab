import {
  assignAuthorColorSlots,
  DOCUMENT_ROLE_RANK,
  DocumentRole,
  type AuthorColorSlot,
  type DocumentsList,
  type DocumentSummary,
  type UserReference,
} from '@superdoc-collab/types';
import { and, desc, eq, inArray, type SQL } from 'drizzle-orm';
import type { AuthDatabase } from '../database/connection';
import { user } from '../database/schema/auth';
import { documentMembers, documents } from '../database/schema/documents';
import { DocumentNotFoundError } from './require-document-role';

class MemberColorSlotMissingError extends Error {}

export class DocumentsRepository {
  private readonly database: AuthDatabase;

  constructor(database: AuthDatabase) {
    this.database = database;
  }

  create({ id, title, ownerUserId }: { id: string; title: string; ownerUserId: string }): void {
    const now = new Date();
    this.database.drizzle.transaction((transaction) => {
      transaction.insert(documents).values({ id, title, ownerUserId, createdAt: now, updatedAt: now }).run();
      transaction.insert(documentMembers).values({ documentId: id, userId: ownerUserId, role: DocumentRole.Owner, joinedAt: now }).run();
    });
  }

  findRole({ documentId, userId }: { documentId: string; userId: string }): DocumentRole | null {
    const row = this.database.drizzle
      .select({ role: documentMembers.role })
      .from(documentMembers)
      .where(and(eq(documentMembers.documentId, documentId), eq(documentMembers.userId, userId)))
      .get();
    if (!row) return null;
    return row.role;
  }

  list(userId: string): DocumentsList {
    const summaries = this.selectSummaries(eq(documentMembers.userId, userId));
    return {
      mine: summaries.filter((summary) => summary.role === DocumentRole.Owner),
      shared: summaries.filter((summary) => summary.role !== DocumentRole.Owner),
    };
  }

  summary({ documentId, userId }: { documentId: string; userId: string }): DocumentSummary {
    const [found] = this.selectSummaries(and(eq(documentMembers.userId, userId), eq(documents.id, documentId)));
    if (!found) throw new DocumentNotFoundError();
    return found;
  }

  rename({ documentId, title }: { documentId: string; title: string }): void {
    this.database.drizzle.update(documents).set({ title, updatedAt: new Date() }).where(eq(documents.id, documentId)).run();
  }

  touch(documentId: string): void {
    this.database.drizzle.update(documents).set({ updatedAt: new Date() }).where(eq(documents.id, documentId)).run();
  }

  remove(documentId: string): void {
    this.database.drizzle.delete(documents).where(eq(documents.id, documentId)).run();
  }

  members(documentId: string): { user: UserReference; role: DocumentRole }[] {
    return this.database.drizzle
      .select({ id: user.id, name: user.name, role: documentMembers.role })
      .from(documentMembers)
      .innerJoin(user, eq(user.id, documentMembers.userId))
      .where(eq(documentMembers.documentId, documentId))
      .orderBy(documentMembers.joinedAt, documentMembers.userId)
      .all()
      .map((row) => ({ user: { id: row.id, name: row.name }, role: row.role }));
  }

  membersWithColorSlots(documentId: string): { user: UserReference; role: DocumentRole; colorSlot: AuthorColorSlot }[] {
    const members = this.members(documentId);
    const slots = assignAuthorColorSlots({ memberIds: members.map((member) => member.user.id) });
    return members.map((member) => {
      const colorSlot = slots.get(member.user.id);
      if (colorSlot === undefined) throw new MemberColorSlotMissingError(member.user.id);
      return { ...member, colorSlot };
    });
  }

  colorSlotOf({ documentId, userId }: { documentId: string; userId: string }): AuthorColorSlot {
    const member = this.membersWithColorSlots(documentId).find((candidate) => candidate.user.id === userId);
    if (!member) throw new MemberColorSlotMissingError(userId);
    return member.colorSlot;
  }

  grant({ documentId, userId, role }: { documentId: string; userId: string; role: DocumentRole }): void {
    const current = this.findRole({ documentId, userId });
    if (!current) {
      this.database.drizzle.insert(documentMembers).values({ documentId, userId, role, joinedAt: new Date() }).run();
      return;
    }
    if (DOCUMENT_ROLE_RANK[current] >= DOCUMENT_ROLE_RANK[role]) return;
    this.database.drizzle
      .update(documentMembers)
      .set({ role })
      .where(and(eq(documentMembers.documentId, documentId), eq(documentMembers.userId, userId)))
      .run();
  }

  revoke({ documentId, userId }: { documentId: string; userId: string }): void {
    this.database.drizzle
      .delete(documentMembers)
      .where(and(eq(documentMembers.documentId, documentId), eq(documentMembers.userId, userId)))
      .run();
  }

  userNames(userIds: string[]): Map<string, string> {
    if (userIds.length === 0) return new Map();
    const rows = this.database.drizzle.select({ id: user.id, name: user.name }).from(user).where(inArray(user.id, userIds)).all();
    return new Map(rows.map((row) => [row.id, row.name]));
  }

  userContacts(userIds: string[]): Map<string, { name: string; email: string }> {
    if (userIds.length === 0) return new Map();
    const rows = this.database.drizzle
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(inArray(user.id, userIds))
      .all();
    return new Map(rows.map((row) => [row.id, { name: row.name, email: row.email }]));
  }

  private selectSummaries(condition: SQL | undefined): DocumentSummary[] {
    return this.database.drizzle
      .select({
        id: documents.id,
        title: documents.title,
        updatedAt: documents.updatedAt,
        role: documentMembers.role,
        ownerId: user.id,
        ownerName: user.name,
      })
      .from(documentMembers)
      .innerJoin(documents, eq(documents.id, documentMembers.documentId))
      .innerJoin(user, eq(user.id, documents.ownerUserId))
      .where(condition)
      .orderBy(desc(documents.updatedAt))
      .all()
      .map((row) => ({
        id: row.id,
        title: row.title,
        updatedAt: row.updatedAt.getTime(),
        role: row.role,
        owner: { id: row.ownerId, name: row.ownerName },
      }));
  }
}
