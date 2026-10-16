import { describe, expect, test } from 'vitest';
import { DOCUMENT_ROLE_RANK, DocumentRole, SHARE_LINK_GRANTS, ShareLinkRole, titleSchema } from './documents';
import { DocumentResource, documentApiPath } from './routes';

describe('documents contracts', () => {
  test('ranks owner above editor above reader and maps links to roles', () => {
    expect([DocumentRole.Reader, DocumentRole.Editor, DocumentRole.Owner].map((role) => DOCUMENT_ROLE_RANK[role])).toEqual([1, 2, 3]);
    expect(SHARE_LINK_GRANTS).toEqual({ [ShareLinkRole.Edit]: DocumentRole.Editor, [ShareLinkRole.Read]: DocumentRole.Reader });
  });
  test('trims a title and rejects a blank one', () => {
    expect(titleSchema.parse({ title: '  Plan  ' }).title).toBe('Plan');
    expect(titleSchema.safeParse({ title: '   ' }).success).toBe(false);
  });
  test('builds encoded document api paths', () => {
    expect(documentApiPath({ documentId: 'a/b' })).toBe('/api/documents/a%2Fb');
    expect(documentApiPath({ documentId: 'd1', resource: DocumentResource.Events })).toBe('/api/documents/d1/events');
  });
});
