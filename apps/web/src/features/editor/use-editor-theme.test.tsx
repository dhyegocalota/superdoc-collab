import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { EDITOR_THEME_STORAGE_KEY, EditorThemePreset } from './editor-theme';
import { useEditorTheme } from './use-editor-theme';

const THEME_CLASS = 'sd-theme-editor';
const UNKNOWN_VALUE = 'sepia';
const CUSTOM_ACCENT = '#336699';

function hasThemeClass(): boolean {
  return document.documentElement.classList.contains(THEME_CLASS);
}

afterEach(() => {
  document.documentElement.classList.remove(THEME_CLASS);
  localStorage.clear();
  vi.restoreAllMocks();
});

test('Default applies no class, and a chosen preset applies the class and is stored', () => {
  const { result } = renderHook(useEditorTheme);
  expect(result.current.choice).toEqual({ preset: EditorThemePreset.Default });
  expect(hasThemeClass()).toBe(false);
  act(() => result.current.choose({ preset: EditorThemePreset.Ocean }));
  expect(result.current.choice).toEqual({ preset: EditorThemePreset.Ocean });
  expect(hasThemeClass()).toBe(true);
  expect(localStorage.getItem(EDITOR_THEME_STORAGE_KEY)).toBe(EditorThemePreset.Ocean);
});

test('choosing Default after a preset removes the class', () => {
  const { result } = renderHook(useEditorTheme);
  act(() => result.current.choose({ preset: EditorThemePreset.Ocean }));
  act(() => result.current.choose({ preset: EditorThemePreset.Default }));
  expect(hasThemeClass()).toBe(false);
  expect(localStorage.getItem(EDITOR_THEME_STORAGE_KEY)).toBe(EditorThemePreset.Default);
});

test('a stored preset applies on mount', () => {
  localStorage.setItem(EDITOR_THEME_STORAGE_KEY, EditorThemePreset.Forest);
  const { result } = renderHook(useEditorTheme);
  expect(result.current.choice).toEqual({ preset: EditorThemePreset.Forest });
  expect(hasThemeClass()).toBe(true);
});

test('a stored accent colour applies on mount and a new accent replaces it live', () => {
  localStorage.setItem(EDITOR_THEME_STORAGE_KEY, CUSTOM_ACCENT);
  const { result } = renderHook(useEditorTheme);
  expect(result.current.choice).toEqual({ accent: CUSTOM_ACCENT });
  act(() => result.current.choose({ accent: '#112233' }));
  expect(result.current.choice).toEqual({ accent: '#112233' });
  expect(document.querySelector(`[data-sd-theme="${THEME_CLASS}"]`)?.textContent).toContain('#112233');
});

test('a stored value that is not a preset or a colour is removed and Default applies', () => {
  localStorage.setItem(EDITOR_THEME_STORAGE_KEY, UNKNOWN_VALUE);
  const { result } = renderHook(useEditorTheme);
  expect(result.current.choice).toEqual({ preset: EditorThemePreset.Default });
  expect(localStorage.getItem(EDITOR_THEME_STORAGE_KEY)).toBeNull();
  expect(hasThemeClass()).toBe(false);
});

test('a throwing storage leaves Default and still applies a choice', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  const { result } = renderHook(useEditorTheme);
  expect(result.current.choice).toEqual({ preset: EditorThemePreset.Default });
  act(() => result.current.choose({ preset: EditorThemePreset.Mono }));
  expect(hasThemeClass()).toBe(true);
});

test('a storage event from another tab applies its choice', () => {
  const { result } = renderHook(useEditorTheme);
  localStorage.setItem(EDITOR_THEME_STORAGE_KEY, EditorThemePreset.Sunset);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: EDITOR_THEME_STORAGE_KEY }));
  });
  expect(result.current.choice).toEqual({ preset: EditorThemePreset.Sunset });
});

test('a storage event for another key changes nothing', () => {
  const { result } = renderHook(useEditorTheme);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }));
  });
  expect(result.current.choice).toEqual({ preset: EditorThemePreset.Default });
});

test('unmounting removes the class', () => {
  const { result, unmount } = renderHook(useEditorTheme);
  act(() => result.current.choose({ preset: EditorThemePreset.Ocean }));
  unmount();
  expect(hasThemeClass()).toBe(false);
});
