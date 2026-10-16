import { DocumentRole } from '@superdoc-history/types';
import { randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import { signedInOwner, signedInUser } from '../testing/test-server';
import { DocumentNotFoundError, DocumentRoleTooLowError, requireDocumentRole } from './require-document-role';

async function twoUsers() {
  const { server, owner } = await signedInOwner();
  return { server, ana: owner.id, bruno: (await signedInUser({ server, name: 'Bruno' })).id };
}

test('grant upgrades a role and never downgrades it', async () => {
  const { server, ana, bruno } = await twoUsers();
  const { documents } = server.services;
  const documentId = randomUUID();
  documents.create({ id: documentId, title: 'Plan', ownerUserId: ana });
  documents.grant({ documentId, userId: bruno, role: DocumentRole.Reader });
  documents.grant({ documentId, userId: bruno, role: DocumentRole.Editor });
  documents.grant({ documentId, userId: bruno, role: DocumentRole.Reader });
  documents.grant({ documentId, userId: ana, role: DocumentRole.Reader });
  expect([documents.findRole({ documentId, userId: bruno }), documents.findRole({ documentId, userId: ana })]).toEqual([DocumentRole.Editor, DocumentRole.Owner]);
  await server.stop();
});

test('the owner sees it as mine and a member as shared, with the owner named', async () => {
  const { server, ana, bruno } = await twoUsers();
  const { documents } = server.services;
  const documentId = randomUUID();
  documents.create({ id: documentId, title: 'Plan', ownerUserId: ana });
  documents.grant({ documentId, userId: bruno, role: DocumentRole.Reader });
  const expected = { id: documentId, title: 'Plan', updatedAt: expect.any(Number), role: DocumentRole.Reader, owner: { id: ana, name: 'Ana' } };
  expect(documents.list(bruno)).toEqual({ mine: [], shared: [expected] });
  expect(documents.list(ana).mine).toEqual([{ ...expected, role: DocumentRole.Owner }]);
  expect(documents.summary({ documentId, userId: bruno })).toEqual(expected);
  await server.stop();
});

test('requireDocumentRole hides a non-member as not found and refuses a low role', async () => {
  const { server, ana, bruno } = await twoUsers();
  const { documents } = server.services;
  const documentId = randomUUID();
  documents.create({ id: documentId, title: 'Plan', ownerUserId: ana });
  expect(() => requireDocumentRole({ documents, documentId, userId: bruno, minimumRole: DocumentRole.Reader })).toThrow(DocumentNotFoundError);
  documents.grant({ documentId, userId: bruno, role: DocumentRole.Reader });
  expect(() => requireDocumentRole({ documents, documentId, userId: bruno, minimumRole: DocumentRole.Editor })).toThrow(DocumentRoleTooLowError);
  expect(requireDocumentRole({ documents, documentId, userId: bruno, minimumRole: DocumentRole.Reader })).toBe(DocumentRole.Reader);
  await server.stop();
});

test('removing a document cascades its members', async () => {
  const { server, ana, bruno } = await twoUsers();
  const { documents } = server.services;
  const documentId = randomUUID();
  documents.create({ id: documentId, title: 'Plan', ownerUserId: ana });
  documents.grant({ documentId, userId: bruno, role: DocumentRole.Editor });
  documents.remove(documentId);
  expect([documents.findRole({ documentId, userId: ana }), documents.findRole({ documentId, userId: bruno })]).toEqual([null, null]);
  await server.stop();
});

test('rename and touch update the summary', async () => {
  const { server, ana } = await twoUsers();
  const { documents } = server.services;
  const documentId = randomUUID();
  documents.create({ id: documentId, title: 'Plan', ownerUserId: ana });
  documents.rename({ documentId, title: 'Roadmap' });
  expect(documents.summary({ documentId, userId: ana }).title).toBe('Roadmap');
  expect(documents.members(documentId)).toEqual([{ user: { id: ana, name: 'Ana' }, role: DocumentRole.Owner }]);
  expect(documents.userNames([ana])).toEqual(new Map([[ana, 'Ana']]));
  await server.stop();
});
