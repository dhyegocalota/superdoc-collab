import { describe, expect, test } from 'vitest';
import { BOOTSTRAP_TIMEOUT_FLOOR_MS } from './constants';
import {
  BOOTSTRAP_LIGHT_MAX_BYTES,
  BootstrapLane,
  bootstrapLaneOf,
  bootstrapTimeoutMsOf,
  MAX_UPLOAD_BYTES,
  titleSchema,
} from './documents';

describe('documents contracts', () => {
  test('trims a title and rejects a blank one', () => {
    expect(titleSchema.parse({ title: '  Plan  ' }).title).toBe('Plan');
    expect(titleSchema.safeParse({ title: '   ' }).success).toBe(false);
  });

  test('pin: a file up to the light limit is prepared in the light lane and a larger one in the heavy lane', () => {
    expect(bootstrapLaneOf(BOOTSTRAP_LIGHT_MAX_BYTES)).toBe(BootstrapLane.Light);
    expect(bootstrapLaneOf(BOOTSTRAP_LIGHT_MAX_BYTES + 1)).toBe(BootstrapLane.Heavy);
  });

  test('the bootstrap timeout is the floor plus five times the measured conversion time of the file', () => {
    expect(bootstrapTimeoutMsOf(0)).toBe(BOOTSTRAP_TIMEOUT_FLOOR_MS);
    expect(bootstrapTimeoutMsOf(MAX_UPLOAD_BYTES)).toBe(BOOTSTRAP_TIMEOUT_FLOOR_MS + 10 * 4500 * 5);
  });
});
