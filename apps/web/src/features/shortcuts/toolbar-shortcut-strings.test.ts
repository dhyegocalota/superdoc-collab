import { expect, test } from 'vitest';
import { Platform } from '@/lib/platform';
import { toolbarShortcutStrings } from './toolbar-shortcut-strings';

test('a tooltip names the item and its keys with symbols on a Mac', () => {
  expect(toolbarShortcutStrings(Platform.Mac)).toMatchObject({
    bold: 'Bold (⌘B)',
    undo: 'Undo (⌘Z)',
    'indent-decrease': 'Decrease indent (⌘[)',
  });
});

test('a tooltip names the item and its keys with names elsewhere', () => {
  expect(toolbarShortcutStrings(Platform.Other)).toMatchObject({
    bold: 'Bold (Ctrl+B)',
    redo: 'Redo (Ctrl+Y)',
    link: 'Insert link (Ctrl+K)',
    'bullet-list': 'Bulleted list (Ctrl+Shift+8)',
  });
});

test('only the items that have a shortcut are overridden', () => {
  expect(Object.keys(toolbarShortcutStrings(Platform.Other)).sort()).toEqual(
    [
      'bold',
      'bullet-list',
      'indent-decrease',
      'indent-increase',
      'italic',
      'link',
      'numbered-list',
      'redo',
      'strikethrough',
      'underline',
      'undo',
    ].sort(),
  );
});
