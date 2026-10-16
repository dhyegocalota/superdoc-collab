import { test, expect } from 'vitest';
import { safeNextPath } from './safe-next-path';

test.each([
  ['/documents', '/documents'],
  ['/documents?x=1', '/documents?x=1'],
  [null, '/documents'],
  ['//evil.example', '/documents'],
  ['https://evil.example/x', '/documents'],
  ['documents', '/documents'],
  ['/\\evil.example', '/documents'],
  ['/\t/evil.example', '/documents'],
  ['/\n/evil.example', '/documents'],
  ['/%5Cevil.example', '/%5Cevil.example'],
])('keeps the next parameter on this origin: %j → %s', (raw, expected) => expect(safeNextPath(raw)).toBe(expected));
