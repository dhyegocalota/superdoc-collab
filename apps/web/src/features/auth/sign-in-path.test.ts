import { AppRoute } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { signInPathFor } from './sign-in-path';

test('the sign-in path carries the current path and query as the way back', () => {
  const location = { pathname: '/documents/doc-1', search: '?at=5&filter=ana' };
  expect(signInPathFor(location)).toBe(`${AppRoute.SignIn}?next=${encodeURIComponent('/documents/doc-1?at=5&filter=ana')}`);
});

test('a path without a query is encoded alone', () => {
  expect(signInPathFor({ pathname: '/documents', search: '' })).toBe(`${AppRoute.SignIn}?next=%2Fdocuments`);
});
