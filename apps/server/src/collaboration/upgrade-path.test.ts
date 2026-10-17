import { ApiPath } from '@superdoc-collab/types';
import { expect, test } from 'vitest';
import { isAgentUpgrade, isLoopbackAddress } from './upgrade-path';

test.each([
  ['127.0.0.1', true],
  ['::1', true],
  ['::ffff:127.0.0.1', true],
  ['10.0.0.5', false],
  ['203.0.113.9', false],
  ['::ffff:10.0.0.5', false],
  ['2001:db8::1', false],
  [undefined, false],
])('the address %s is loopback: %s', (address, expected) => {
  expect(isLoopbackAddress(address)).toBe(expected);
});

test.each([
  [ApiPath.AgentCollaboration, true],
  [`${ApiPath.AgentCollaboration}?token=x`, true],
  [ApiPath.Collaboration, false],
])('the url %s is an agent upgrade: %s', (url, expected) => {
  expect(isAgentUpgrade(url)).toBe(expected);
});
