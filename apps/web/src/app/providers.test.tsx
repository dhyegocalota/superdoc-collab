import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { THEME_STORAGE_KEY, ThemePreference } from '@/lib/use-theme';
import { Providers } from './providers';

const DARK_CLASS = 'dark';

afterEach(() => {
  document.documentElement.classList.remove(DARK_CLASS);
  localStorage.clear();
});

test('Providers applies the stored theme on mount', () => {
  localStorage.setItem(THEME_STORAGE_KEY, ThemePreference.Dark);
  render(<Providers>content</Providers>);
  expect(screen.getByText('content')).toBeInTheDocument();
  expect(document.documentElement).toHaveClass(DARK_CLASS);
});

test('Providers follows a theme change made in another tab', () => {
  render(<Providers>content</Providers>);
  expect(document.documentElement).not.toHaveClass(DARK_CLASS);
  localStorage.setItem(THEME_STORAGE_KEY, ThemePreference.Dark);
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY }));
  });
  expect(document.documentElement).toHaveClass(DARK_CLASS);
});
