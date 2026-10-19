import { describe, expect, test } from 'vitest';
import { BOOTSTRAP_LIGHT_MAX_BYTES, BootstrapLane, bootstrapLaneOf, titleSchema } from './documents';

describe('documents contracts', () => {
  test('trims a title and rejects a blank one', () => {
    expect(titleSchema.parse({ title: '  Plan  ' }).title).toBe('Plan');
    expect(titleSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  test('pin: a file up to the light limit is prepared in the light lane and a larger one in the heavy lane', () => {
    expect(bootstrapLaneOf(BOOTSTRAP_LIGHT_MAX_BYTES)).toBe(BootstrapLane.Light);
    expect(bootstrapLaneOf(BOOTSTRAP_LIGHT_MAX_BYTES + 1)).toBe(BootstrapLane.Heavy);
  });
});
