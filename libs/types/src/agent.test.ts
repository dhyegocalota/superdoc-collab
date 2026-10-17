import { expect, test } from 'vitest';
import { agentAuthorName } from './agent';

test('an agent author name is the person name marked as AI', () => {
  expect(agentAuthorName('Ana')).toBe('Ana · AI');
});
