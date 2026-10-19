import { DocumentRole } from '@superdoc-collab/types';
import { expect, test, vi } from 'vitest';
import { signBootstrapToken } from '../agent/room-tokens';
import type { Auth } from '../auth/auth';
import type { DocumentsRepository } from '../documents/documents-repository';
import { authenticateBootstrap } from './authenticate-bootstrap';
import { CollaborationAuthenticationError } from './authenticate-member';
import type { BootstrapState } from './bootstrap-state';
import type { RoomBootstrap } from './room-bootstrap';

const SECRET = 'a-secret-of-at-least-thirty-two-characters';
const DOCUMENT_ID = 'document-plan';
const OWNER_ID = 'user-ana';
const ATTEMPT = 'attempt-one';

function admissionWith({ isCurrent = true, isCommitted = false }: { isCurrent?: boolean; isCommitted?: boolean } = {}) {
  const token = signBootstrapToken({ secret: SECRET, userId: OWNER_ID, documentId: DOCUMENT_ID, attempt: ATTEMPT, now: Date.now() });
  return authenticateBootstrap({
    auth: { $context: Promise.resolve({ secret: SECRET }) } as unknown as Auth,
    documents: { findRole: vi.fn(() => DocumentRole.Owner) } as unknown as DocumentsRepository,
    roomBootstrap: { isCurrent: vi.fn(() => isCurrent) } as unknown as RoomBootstrap,
    bootstrap: { isCommitted: vi.fn(() => isCommitted) } as unknown as BootstrapState,
    token,
    documentId: DOCUMENT_ID,
  });
}

test('the owner with the current attempt on an uncommitted room is admitted', async () => {
  await expect(admissionWith()).resolves.toEqual({ userId: OWNER_ID, role: DocumentRole.Owner, bootstrapAttempt: ATTEMPT });
});

test('a bootstrap socket on a committed room is refused even with the current attempt', async () => {
  await expect(admissionWith({ isCommitted: true })).rejects.toBeInstanceOf(CollaborationAuthenticationError);
});

test('a stale attempt is refused', async () => {
  await expect(admissionWith({ isCurrent: false })).rejects.toBeInstanceOf(CollaborationAuthenticationError);
});
