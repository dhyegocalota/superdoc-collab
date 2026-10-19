import { render } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { Platform } from '@/lib/platform';
import { ShortcutHint, ShortcutKeyPills } from './shortcut-hint';
import { ShortcutId } from './shortcuts';

afterEach(() => vi.unstubAllGlobals());

function pillTexts(container: HTMLElement): (string | null)[] {
  return [...container.querySelectorAll('kbd')].map((pill) => pill.textContent);
}

test('pills show one kbd per Mac symbol', () => {
  const { container } = render(<ShortcutKeyPills shortcutId={ShortcutId.NormalText} platform={Platform.Mac} />);
  expect(pillTexts(container)).toEqual(['⌘', '⇧', 'N']);
});

test('pills show one kbd per name elsewhere', () => {
  const { container } = render(<ShortcutKeyPills shortcutId={ShortcutId.NormalText} platform={Platform.Other} />);
  expect(pillTexts(container)).toEqual(['Ctrl', 'Shift', 'N']);
});

test('the hint follows the detected platform', () => {
  vi.stubGlobal('navigator', { platform: 'Win32' });
  const { container } = render(<ShortcutHint shortcutId={ShortcutId.DownloadDocx} />);
  expect(pillTexts(container)).toEqual(['Ctrl', 'S']);
});
