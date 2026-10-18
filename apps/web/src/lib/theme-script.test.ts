import { afterEach, expect, test, vi } from 'vitest';
import html from '../../index.html?raw';
import { THEME_STORAGE_KEY, ThemePreference } from './use-theme';

const MODULE_SCRIPT_TAG = '/src/main.tsx';
const INLINE_SCRIPT_PATTERN = /<script>([\s\S]*?)<\/script>/;
const DARK_CLASS = 'dark';

function inlineScript(): string {
  const match = INLINE_SCRIPT_PATTERN.exec(html);
  if (!match) throw new Error('index.html has no inline script');
  return match[1]!;
}

function runInlineScript(): void {
  new Function(inlineScript())();
}

function stubSystemTheme(prefersDark: boolean): void {
  vi.stubGlobal('matchMedia', () => ({ matches: prefersDark }));
}

afterEach(() => {
  document.documentElement.classList.remove(DARK_CLASS);
  localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('index.html sets dark before the bundle and reads THEME_STORAGE_KEY', () => {
  const scriptIndex = html.search(INLINE_SCRIPT_PATTERN);
  expect(html.includes(THEME_STORAGE_KEY)).toBe(true);
  expect(html.includes(`classList.add('${DARK_CLASS}')`)).toBe(true);
  expect(scriptIndex).toBeGreaterThanOrEqual(0);
  expect(scriptIndex).toBeLessThan(html.indexOf(MODULE_SCRIPT_TAG));
});

test('the inline script has no imports', () => {
  expect(inlineScript()).not.toMatch(/\bimport\b/);
});

test.each([
  { stored: ThemePreference.Dark, prefersDark: false, isDark: true },
  { stored: ThemePreference.Light, prefersDark: true, isDark: false },
  { stored: ThemePreference.System, prefersDark: true, isDark: true },
  { stored: ThemePreference.System, prefersDark: false, isDark: false },
  { stored: null, prefersDark: true, isDark: true },
  { stored: 'sepia', prefersDark: false, isDark: false },
])('stored $stored with a dark system $prefersDark gives dark $isDark', ({ stored, prefersDark, isDark }) => {
  stubSystemTheme(prefersDark);
  if (stored !== null) localStorage.setItem(THEME_STORAGE_KEY, stored);
  runInlineScript();
  expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(isDark);
});

test('the inline script never throws when storage is unavailable', () => {
  stubSystemTheme(false);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(runInlineScript).not.toThrow();
  expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
});
