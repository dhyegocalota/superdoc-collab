import { expect, test } from 'vitest';
import { UserAction } from './account-access';
import {
  AdminResource,
  adminApiPath,
  DocumentResource,
  isTabId,
  documentApiPath,
  selectionSummaryApiPath,
  sharePagePath,
  signUpPagePath,
  STOP_IMPERSONATING_API_PATH,
  timelineEditsApiPath,
  userActionApiPath,
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

const TAB_ID = '3f2b8c1e-9d4a-4e7b-8a6c-5d1e2f3a4b5c';
const OVERSIZED_TAB_ID_LENGTH = 16 * 1024;

test.each([
  { name: 'a UUID', value: TAB_ID, expected: true },
  { name: 'an empty string', value: '', expected: false },
  { name: 'a word', value: 'tab', expected: false },
  { name: 'a UUID followed by text', value: `${TAB_ID}x`, expected: false },
  { name: 'a 16 KB string', value: 'a'.repeat(OVERSIZED_TAB_ID_LENGTH), expected: false },
])('isTabId accepts only a UUID: $name', ({ value, expected }) => {
  expect(isTabId(value)).toBe(expected);
});

test('user action paths encode the user id and name the action', () => {
  expect(userActionApiPath({ userId: 'a/b', action: UserAction.Archive })).toBe('/api/admin/users/a%2Fb/archive');
  expect(userActionApiPath({ userId: 'u', action: UserAction.Impersonate })).toBe('/api/admin/users/u/impersonate');
  expect(STOP_IMPERSONATING_API_PATH).toBe('/api/auth/admin/stop-impersonating');
});
