import { test, expect } from 'vitest';
import { safeNextPath } from './safe-next-path';

test.each([
  ['/documents', '/documents'],
  ['/documents?x=1', '/documents?x=1'],
  [null, '/documents'],
  ['//evil.example', '/documents'],
  ['https://evil.example/x', '/documents'],
  ['documents', '/documents'],
])('ignores an absolute next parameter: %s → %s', (raw, expected) => expect(safeNextPath(raw)).toBe(expected));
