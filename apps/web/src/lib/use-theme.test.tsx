import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { THEME_STORAGE_KEY, ThemePreference, useTheme } from './use-theme';

const DARK_CLASS = 'dark';
const UNKNOWN_VALUE = 'sepia';

type MediaListener = (event: { matches: boolean }) => void;

let prefersDark = false;
let mediaListeners: MediaListener[] = [];

function stubMatchMedia(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return prefersDark;
    },
    media: query,
    addEventListener: (_type: string, listener: MediaListener) => mediaListeners.push(listener),
    removeEventListener: (_type: string, listener: MediaListener) => {
      mediaListeners = mediaListeners.filter((registered) => registered !== listener);
    },
  }));
}

function isDark(): boolean {
  return document.documentElement.classList.contains(DARK_CLASS);
}

function changeSystemTheme(nextPrefersDark: boolean): void {
  prefersDark = nextPrefersDark;
  act(() => mediaListeners.forEach((listener) => listener({ matches: nextPrefersDark })));
}

beforeEach(() => {
  prefersDark = false;
  mediaListeners = [];
  stubMatchMedia();
});

afterEach(() => {
  document.documentElement.classList.remove(DARK_CLASS);
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('useTheme adds dark to html for Dark and stores the choice', () => {
  const { result } = renderHook(useTheme);
  expect(result.current.preference).toBe(ThemePreference.System);
  expect(isDark()).toBe(false);
  act(() => result.current.choosePreference(ThemePreference.Dark));
  expect(isDark()).toBe(true);
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(ThemePreference.Dark);
  act(() => result.current.choosePreference(ThemePreference.Light));
  expect(isDark()).toBe(false);
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(ThemePreference.Light);
});

test('an unknown stored value is removed and System applies', () => {
  localStorage.setItem(THEME_STORAGE_KEY, UNKNOWN_VALUE);
  const { result } = renderHook(useTheme);
  expect(result.current.preference).toBe(ThemePreference.System);
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  expect(isDark()).toBe(false);
});

test('a stored Dark applies on mount', () => {
  localStorage.setItem(THEME_STORAGE_KEY, ThemePreference.Dark);
  const { result } = renderHook(useTheme);
  expect(result.current.preference).toBe(ThemePreference.Dark);
  expect(isDark()).toBe(true);
});

test('System follows the operating system live and Light ignores it', () => {
  const { result } = renderHook(useTheme);
  changeSystemTheme(true);
  expect(isDark()).toBe(true);
  changeSystemTheme(false);
  expect(isDark()).toBe(false);
  act(() => result.current.choosePreference(ThemePreference.Light));
  changeSystemTheme(true);
  expect(isDark()).toBe(false);
});

test('a storage event from another tab applies its choice', () => {
  const { result } = renderHook(useTheme);
  localStorage.setItem(THEME_STORAGE_KEY, ThemePreference.Dark);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY }));
  });
  expect(result.current.preference).toBe(ThemePreference.Dark);
  expect(isDark()).toBe(true);
});

test('a storage event for another key changes nothing', () => {
  const { result } = renderHook(useTheme);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
  });
  expect(result.current.preference).toBe(ThemePreference.System);
});

test('a throwing storage leaves System and still applies a choice', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const { result } = renderHook(useTheme);
  expect(result.current.preference).toBe(ThemePreference.System);
  act(() => result.current.choosePreference(ThemePreference.Dark));
  expect(isDark()).toBe(true);
});
