import { afterEach, expect, test, vi } from 'vitest';
import { detectPlatform, Platform } from './platform';

afterEach(() => vi.unstubAllGlobals());

test('a Mac is read from navigator.platform', () => {
  vi.stubGlobal('navigator', { platform: 'MacIntel' });
  expect(detectPlatform()).toBe(Platform.Mac);
});

test('a Mac is read from userAgentData when navigator.platform is empty', () => {
  vi.stubGlobal('navigator', { platform: '', userAgentData: { platform: 'macOS' } });
  expect(detectPlatform()).toBe(Platform.Mac);
});

test('navigator.platform wins over userAgentData, as in the editor', () => {
  vi.stubGlobal('navigator', { platform: 'MacIntel', userAgentData: { platform: 'Windows' } });
  expect(detectPlatform()).toBe(Platform.Mac);
});

test('Windows and Linux are the other platform', () => {
  vi.stubGlobal('navigator', { platform: 'Win32' });
  expect(detectPlatform()).toBe(Platform.Other);
  vi.stubGlobal('navigator', { platform: 'Linux x86_64' });
  expect(detectPlatform()).toBe(Platform.Other);
});
