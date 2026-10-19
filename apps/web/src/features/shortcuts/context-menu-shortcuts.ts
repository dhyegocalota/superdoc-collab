import type { ContextMenuConfig, ContextMenuResolvedSection } from 'superdoc';
import type { Platform } from '@/lib/platform';
import { shortcutLabel } from './shortcut-keys';
import { ShortcutId } from './shortcuts';

const CONTEXT_MENU_SHORTCUT_IDS: Record<string, ShortcutId> = {
  comment: ShortcutId.AddComment,
  cut: ShortcutId.Cut,
  copy: ShortcutId.Copy,
  paste: ShortcutId.Paste,
  'paste-match-destination': ShortcutId.PasteWithoutFormatting,
  undo: ShortcutId.Undo,
  redo: ShortcutId.Redo,
  'insert-link': ShortcutId.Link,
  'insert-footnote': ShortcutId.InsertFootnote,
};

export function contextMenuShortcutProvider(platform: Platform): NonNullable<ContextMenuConfig['menuProvider']> {
  return (_context, sections) =>
    sections.map((section): ContextMenuResolvedSection => ({
      ...section,
      items: section.items.map((item) => {
        const id = CONTEXT_MENU_SHORTCUT_IDS[item.id];
        return id ? { ...item, shortcut: shortcutLabel({ id, platform }) } : item;
      }),
    }));
}
