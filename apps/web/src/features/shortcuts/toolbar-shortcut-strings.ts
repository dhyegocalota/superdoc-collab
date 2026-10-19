import type { ToolbarStringId } from 'superdoc';
import type { Platform } from '@/lib/platform';
import { shortcutLabel } from './shortcut-keys';
import { ShortcutId } from './shortcuts';
import { SHORTCUT_LABELS } from './shortcuts-copy';

const TOOLBAR_SHORTCUT_IDS: Partial<Record<ToolbarStringId, ShortcutId>> = {
  bold: ShortcutId.Bold,
  italic: ShortcutId.Italic,
  underline: ShortcutId.Underline,
  strikethrough: ShortcutId.Strikethrough,
  undo: ShortcutId.Undo,
  redo: ShortcutId.Redo,
  link: ShortcutId.Link,
  'bullet-list': ShortcutId.BulletedList,
  'numbered-list': ShortcutId.NumberedList,
  'indent-increase': ShortcutId.Indent,
  'indent-decrease': ShortcutId.Outdent,
};

export function toolbarShortcutStrings(platform: Platform): Partial<Record<ToolbarStringId, string>> {
  return Object.fromEntries(
    Object.entries(TOOLBAR_SHORTCUT_IDS).map(([stringId, id]) => [stringId, `${SHORTCUT_LABELS[id]} (${shortcutLabel({ id, platform })})`]),
  );
}
