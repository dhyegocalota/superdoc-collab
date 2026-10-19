import { expect, test } from 'vitest';
import { Platform } from '@/lib/platform';
import { shortcutKeyParts, shortcutLabel } from './shortcut-keys';
import { ShortcutId } from './shortcuts';

test('a Mac shows symbols', () => {
  expect(shortcutKeyParts({ id: ShortcutId.NormalText, platform: Platform.Mac })).toEqual(['⌘', '⇧', 'N']);
  expect(shortcutLabel({ id: ShortcutId.NormalText, platform: Platform.Mac })).toBe('⌘⇧N');
  expect(shortcutLabel({ id: ShortcutId.Heading1, platform: Platform.Mac })).toBe('⌘⌥1');
});

test('the other platforms show names joined by a plus', () => {
  expect(shortcutKeyParts({ id: ShortcutId.NormalText, platform: Platform.Other })).toEqual(['Ctrl', 'Shift', 'N']);
  expect(shortcutLabel({ id: ShortcutId.NormalText, platform: Platform.Other })).toBe('Ctrl+Shift+N');
  expect(shortcutLabel({ id: ShortcutId.Heading1, platform: Platform.Other })).toBe('Ctrl+Alt+1');
});

test('a key without a modifier shows alone', () => {
  expect(shortcutLabel({ id: ShortcutId.LeaveEditor, platform: Platform.Mac })).toBe('Esc');
  expect(shortcutLabel({ id: ShortcutId.LeaveEditor, platform: Platform.Other })).toBe('Esc');
});
