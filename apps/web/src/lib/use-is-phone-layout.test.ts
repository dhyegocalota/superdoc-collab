import { renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { NARROW_VIEWPORT_WIDTH, stubViewportWidth, WIDE_VIEWPORT_WIDTH } from '@/testing/viewport';
import { useIsPhoneLayout } from './use-is-phone-layout';

afterEach(() => vi.restoreAllMocks());

test('the phone layout is every width below lg', () => {
  stubViewportWidth(NARROW_VIEWPORT_WIDTH);
  expect(renderHook(useIsPhoneLayout).result.current).toBe(true);
  stubViewportWidth(WIDE_VIEWPORT_WIDTH);
  expect(renderHook(useIsPhoneLayout).result.current).toBe(false);
});
