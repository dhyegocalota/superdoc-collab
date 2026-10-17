import { sharePagePath, ShareLinkRole, type ShareLinks } from '@superdoc-collab/types';
import { eq } from 'drizzle-orm';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { hashToken } from '../auth/token-hash';
import type { AuthDatabase } from '../database/connection';
import { documentShareLinks } from '../database/schema/documents';

const NONCE_BYTES = 32;
const TOKEN_DIGEST = 'sha256';

export function deriveShareToken({ secret, nonce }: { secret: string; nonce: string }): string {
  return createHmac(TOKEN_DIGEST, secret).update(nonce).digest('base64url');
}

export class ShareLinksRepository {
  private readonly database: AuthDatabase;
  private readonly secret: string;
  private readonly appOrigin: string;

  constructor({ database, secret, appOrigin }: { database: AuthDatabase; secret: string; appOrigin: string }) {
    this.database = database;
    this.secret = secret;
    this.appOrigin = appOrigin;
  }

  // NB ADR 0017: a link whose stored token hash does not match the current signing secret never resolves and is reissued on read.
  links(documentId: string): ShareLinks {
    const existing = this.database.drizzle.select().from(documentShareLinks).where(eq(documentShareLinks.documentId, documentId)).all();
    const missing = Object.values(ShareLinkRole).filter((role) => !existing.some((row) => row.role === role && this.isIssuedBySecret(row)));
    if (missing.length > 0) {
      missing.forEach((role) => this.writeNonce({ documentId, role }));
      return this.links(documentId);
    }
    return Object.fromEntries(
      existing.map((row) => [row.role, `${this.appOrigin}${sharePagePath(deriveShareToken({ secret: this.secret, nonce: row.nonce }))}`]),
    ) as ShareLinks;
  }

  rotate({ documentId, role }: { documentId: string; role: ShareLinkRole }): ShareLinks {
    this.writeNonce({ documentId, role });
    return this.links(documentId);
  }

  resolve(token: string): { documentId: string; role: ShareLinkRole } | null {
    const tokenHash = hashToken(token);
    const row = this.database.drizzle.select().from(documentShareLinks).where(eq(documentShareLinks.tokenHash, tokenHash)).get();
    if (!row) return null;
    if (!this.isIssuedBySecret(row)) return null;
    if (!timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(tokenHash))) return null;
    return { documentId: row.documentId, role: row.role };
  }

  private isIssuedBySecret({ nonce, tokenHash }: { nonce: string; tokenHash: string }): boolean {
    return hashToken(deriveShareToken({ secret: this.secret, nonce })) === tokenHash;
  }

  private writeNonce({ documentId, role }: { documentId: string; role: ShareLinkRole }): void {
    const nonce = randomBytes(NONCE_BYTES).toString('base64url');
    const tokenHash = hashToken(deriveShareToken({ secret: this.secret, nonce }));
    this.database.drizzle
      .insert(documentShareLinks)
      .values({ documentId, role, nonce, tokenHash, createdAt: new Date() })
      .onConflictDoUpdate({ target: [documentShareLinks.documentId, documentShareLinks.role], set: { nonce, tokenHash } })
      .run();
  }
}
