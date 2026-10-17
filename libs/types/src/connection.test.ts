import { expect, test } from 'vitest';
import { ConnectionState } from './connection';

test('the connection states are the five values the banner names', () => {
  expect(Object.values(ConnectionState)).toEqual(['online', 'lost', 'reconnecting', 'recovered', 'failed']);
});
