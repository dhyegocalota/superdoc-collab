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

type StoredShareLink = { role: ShareLinkRole; nonce: string; tokenHash: string };

function knownSecretsOf({ secret, previousSecret }: { secret: string; previousSecret: string | null }): string[] {
  if (previousSecret === null) return [secret];
  return [secret, previousSecret];
}

export class ShareLinksRepository {
  private readonly database: AuthDatabase;
  private readonly secret: string;
  private readonly knownSecrets: string[];
  private readonly appOrigin: string;

  constructor({
    database,
    secret,
    previousSecret,
    appOrigin,
  }: {
    database: AuthDatabase;
    secret: string;
    previousSecret: string | null;
    appOrigin: string;
  }) {
    this.database = database;
    this.secret = secret;
    this.knownSecrets = knownSecretsOf({ secret, previousSecret });
    this.appOrigin = appOrigin;
  }

  // NB ADR 0051: a link issued under the current or the previous secret keeps its URL; one issued under neither never resolves and is reissued on read.
  links(documentId: string): ShareLinks {
    const existing = this.database.drizzle.select().from(documentShareLinks).where(eq(documentShareLinks.documentId, documentId)).all();
    const issued = existing.flatMap((row) => this.issuedLinkOf(row));
    const missing = Object.values(ShareLinkRole).filter((role) => !issued.some((link) => link.role === role));
    if (missing.length > 0) {
      missing.forEach((role) => this.writeNonce({ documentId, role }));
      return this.links(documentId);
    }
    return Object.fromEntries(issued.map((link) => [link.role, `${this.appOrigin}${sharePagePath(link.token)}`])) as ShareLinks;
  }

  rotate({ documentId, role }: { documentId: string; role: ShareLinkRole }): ShareLinks {
    this.writeNonce({ documentId, role });
    return this.links(documentId);
  }

  resolve(token: string): { documentId: string; role: ShareLinkRole } | null {
    const tokenHash = hashToken(token);
    const row = this.database.drizzle.select().from(documentShareLinks).where(eq(documentShareLinks.tokenHash, tokenHash)).get();
    if (!row) return null;
    if (this.issuedLinkOf(row).length === 0) return null;
    if (!timingSafeEqual(Buffer.from(row.tokenHash), Buffer.from(tokenHash))) return null;
    return { documentId: row.documentId, role: row.role };
  }

  private issuedLinkOf(row: StoredShareLink): { role: ShareLinkRole; token: string }[] {
    const tokens = this.knownSecrets.map((secret) => deriveShareToken({ secret, nonce: row.nonce }));
    return tokens.filter((token) => hashToken(token) === row.tokenHash).map((token) => ({ role: row.role, token }));
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
