import { DocumentRole, type SessionUser } from '@superdoc-collab/types';
import { Hono } from 'hono';
import { expect, test, vi } from 'vitest';
import type { SignedIn } from '../http/require-user';
import type { DocumentsRepository } from './documents-repository';
import { authorizedDocumentId } from './require-document-role';

const USER: SessionUser = { id: 'u1', name: 'Ana', email: 'ana@example.com' };

function appWith(role: DocumentRole | null) {
  const findRole = vi.fn(() => role);
  const documents = { findRole } as unknown as DocumentsRepository;
  const app = new Hono<SignedIn>();
  app.use(async (context, next) => {
    context.set('user', USER);
    await next();
  });
  app.onError((error, context) => context.text(error.constructor.name, 500));
  app.get('/:documentId', (context) => context.text(authorizedDocumentId({ context, documents, minimumRole: DocumentRole.Editor })));
  return { app, findRole };
}

test('an editor gets the document id from the path', async () => {
  const { app, findRole } = appWith(DocumentRole.Editor);
  expect(await (await app.request('/d1')).text()).toBe('d1');
  expect(findRole).toHaveBeenCalledWith({ documentId: 'd1', userId: USER.id });
});

test('a reader is refused with the role error', async () => {
  expect(await (await appWith(DocumentRole.Reader).app.request('/d1')).text()).toBe('DocumentRoleTooLowError');
});

test('a stranger is refused with the not-found error', async () => {
  expect(await (await appWith(null).app.request('/d1')).text()).toBe('DocumentNotFoundError');
});
