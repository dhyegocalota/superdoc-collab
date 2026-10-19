import type { ContextMenuOpenContext, ContextMenuResolvedSection } from 'superdoc';
import { expect, test } from 'vitest';
import { Platform } from '@/lib/platform';
import { contextMenuShortcutProvider } from './context-menu-shortcuts';

const OPEN_CONTEXT = {} as ContextMenuOpenContext;
const BUILT_IN_SECTIONS: readonly ContextMenuResolvedSection[] = [
  { id: 'review', items: [{ id: 'comment', label: 'Comment', disabled: false }] },
  {
    id: 'clipboard',
    items: [
      { id: 'cut', label: 'Cut', shortcut: 'Mod+X', disabled: false },
      { id: 'paste-match-destination', label: 'Match Destination Formatting', shortcut: 'Mod+Shift+V', disabled: false },
      { id: 'paste-text-only', label: 'Keep Text Only', disabled: false },
    ],
  },
  { id: 'history', items: [{ id: 'undo', label: 'Undo', shortcut: 'Mod+Z', disabled: false }] },
  {
    id: 'insert',
    items: [
      { id: 'insert-link', label: 'Insert link', disabled: false },
      { id: 'insert-table', label: 'Insert table', disabled: false },
      { id: 'insert-footnote', label: 'Insert footnote', disabled: false },
    ],
  },
];

function shortcutsOf({ platform, sections = BUILT_IN_SECTIONS }: { platform: Platform; sections?: readonly ContextMenuResolvedSection[] }) {
  const provided = contextMenuShortcutProvider(platform)(OPEN_CONTEXT, sections);
  if (!provided) throw new Error('the provider returned nothing');
  return Object.fromEntries(provided.flatMap((section) => section.items.map((item) => [item.id, item.shortcut])));
}

test('comment and insert link carry the platform label', () => {
  expect(shortcutsOf({ platform: Platform.Other })).toMatchObject({ comment: 'Ctrl+Alt+M', 'insert-link': 'Ctrl+K' });
  expect(shortcutsOf({ platform: Platform.Mac })).toMatchObject({ comment: '⌘⌥M', 'insert-link': '⌘K' });
});

test('the clipboard, history and footnote items carry their labels in place of the raw strings', () => {
  expect(shortcutsOf({ platform: Platform.Other })).toMatchObject({
    cut: 'Ctrl+X',
    'paste-match-destination': 'Ctrl+Shift+V',
    undo: 'Ctrl+Z',
    'insert-footnote': 'Ctrl+Alt+F',
  });
  expect(shortcutsOf({ platform: Platform.Mac })).toMatchObject({ cut: '⌘X', undo: '⌘Z', 'insert-footnote': '⌘⌥F' });
});

test('items without a key stay without a hint', () => {
  const shortcuts = shortcutsOf({ platform: Platform.Other });
  expect(shortcuts['insert-table']).toBeUndefined();
  expect(shortcuts['paste-text-only']).toBeUndefined();
});

test('every section and item is kept, and an unknown item is returned untouched', () => {
  const unknown: ContextMenuResolvedSection = {
    id: 'extra',
    items: [{ id: 'mystery', label: 'Mystery', shortcut: 'Mod+Q', disabled: true }],
  };
  const provided = contextMenuShortcutProvider(Platform.Other)(OPEN_CONTEXT, [...BUILT_IN_SECTIONS, unknown]);
  expect(provided?.map((section) => section.id)).toEqual([...BUILT_IN_SECTIONS, unknown].map((section) => section.id));
  expect(provided?.at(-1)).toEqual(unknown);
});
