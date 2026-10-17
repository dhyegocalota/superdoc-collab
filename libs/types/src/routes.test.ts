import { expect, test } from 'vitest';
import {
  AdminResource,
  adminApiPath,
  DocumentResource,
  documentApiPath,
  selectionSummaryApiPath,
  sharePagePath,
  signUpPagePath,
  timelineEditsApiPath,
  VersionResource,
  versionApiPath,
  versionCollaborationPath,
  versionViewPagePath,
} from './routes';

test('builds every path with its ids encoded', () => {
  const built = [
    documentApiPath({ documentId: 'a/b' }),
    documentApiPath({ documentId: 'd1', resource: DocumentResource.Events }),
    versionApiPath({ documentId: 'a/b', sequence: 42 }),
    versionApiPath({ documentId: 'd1', sequence: 7, resource: VersionResource.Text }),
    timelineEditsApiPath('d1'),
    versionViewPagePath({ documentId: 'd1', sequence: 42 }),
    versionCollaborationPath({ documentId: 'a/b', sequence: 42 }),
    selectionSummaryApiPath('a/b'),
    sharePagePath('a b'),
  ];
  expect(built).toEqual([
    '/api/documents/a%2Fb',
    '/api/documents/d1/events',
    '/api/documents/a%2Fb/versions/42',
    '/api/documents/d1/versions/7/text',
    '/api/documents/d1/topics/refresh',
    '/api/documents/d1/timeline/edits',
    '/documents/d1/versions/42/view',
    '/collaboration/versions/a%2Fb/42',
    '/api/documents/a%2Fb/summaries/selection',
    '/share/a%20b',
  ]);
});

test('invite and admin paths encode their parameters', () => {
  expect(adminApiPath(AdminResource.Users)).toBe('/api/admin/users');
  expect(adminApiPath(AdminResource.Invites)).toBe('/api/admin/invites');
  expect(signUpPagePath('x/y')).toBe('/sign-up?invite=x%2Fy');
});
