import { Platform } from '@/lib/platform';
import { ShortcutGroup, ShortcutId, ShortcutModifier } from './shortcuts';

export const MODIFIER_LABELS: Record<Platform, Record<ShortcutModifier, string>> = {
  [Platform.Mac]: { [ShortcutModifier.Mod]: '⌘', [ShortcutModifier.Shift]: '⇧', [ShortcutModifier.Alt]: '⌥' },
  [Platform.Other]: { [ShortcutModifier.Mod]: 'Ctrl', [ShortcutModifier.Shift]: 'Shift', [ShortcutModifier.Alt]: 'Alt' },
};

export const KEY_SEPARATORS: Record<Platform, string> = { [Platform.Mac]: '', [Platform.Other]: '+' };

export const SHORTCUT_GROUP_LABELS: Record<ShortcutGroup, string> = {
  [ShortcutGroup.Editing]: 'Editing',
  [ShortcutGroup.Formatting]: 'Formatting',
  [ShortcutGroup.Paragraph]: 'Paragraph',
  [ShortcutGroup.Navigation]: 'Navigation',
  [ShortcutGroup.Document]: 'Document',
  [ShortcutGroup.App]: 'App',
};

export const SHORTCUT_LABELS: Record<ShortcutId, string> = {
  [ShortcutId.Undo]: 'Undo',
  [ShortcutId.Redo]: 'Redo',
  [ShortcutId.RedoAlternate]: 'Redo',
  [ShortcutId.Bold]: 'Bold',
  [ShortcutId.Italic]: 'Italic',
  [ShortcutId.Underline]: 'Underline',
  [ShortcutId.Strikethrough]: 'Strikethrough',
  [ShortcutId.FontGrow]: 'Grow font',
  [ShortcutId.FontShrink]: 'Shrink font',
  [ShortcutId.Link]: 'Insert link',
  [ShortcutId.AlignLeft]: 'Align left',
  [ShortcutId.AlignCenter]: 'Centre',
  [ShortcutId.AlignRight]: 'Align right',
  [ShortcutId.AlignJustify]: 'Justify',
  [ShortcutId.BulletedList]: 'Bulleted list',
  [ShortcutId.NumberedList]: 'Numbered list',
  [ShortcutId.Heading1]: 'Heading 1',
  [ShortcutId.Heading2]: 'Heading 2',
  [ShortcutId.Heading3]: 'Heading 3',
  [ShortcutId.NormalText]: 'Normal text',
  [ShortcutId.Indent]: 'Increase indent',
  [ShortcutId.Outdent]: 'Decrease indent',
  [ShortcutId.Find]: 'Find in document',
  [ShortcutId.LeaveEditor]: 'Leave the editing surface',
  [ShortcutId.DownloadDocx]: 'Download DOCX',
  [ShortcutId.DownloadPdf]: 'Download PDF',
  [ShortcutId.ShowShortcuts]: 'Keyboard shortcuts',
  [ShortcutId.ShowShortcutsOutsideField]: 'Keyboard shortcuts, outside a text field',
};
