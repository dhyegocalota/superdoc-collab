import { expect, test } from 'vitest';
import { assertBootstrapApplied } from './bootstrap-applied';
import { BootstrapNotAppliedError } from './projection-messages';

test('an open result whose bootstrap was not applied is refused', () => {
  expect(() => assertBootstrapApplied({ bootstrap: { bootstrapApplied: false } })).toThrow(BootstrapNotAppliedError);
});

test('an open result whose bootstrap was applied is accepted', () => {
  expect(() => assertBootstrapApplied({ bootstrap: { bootstrapApplied: true } })).not.toThrow();
});

test('an open result that says nothing about the bootstrap is accepted', () => {
  expect(() => assertBootstrapApplied({})).not.toThrow();
  expect(() => assertBootstrapApplied({ bootstrap: {} })).not.toThrow();
});
