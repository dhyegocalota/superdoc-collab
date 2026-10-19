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
  [ShortcutGroup.Title]: 'Title',
  [ShortcutGroup.Review]: 'Comments and review',
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
  [ShortcutId.SaveTitle]: 'Save title',
  [ShortcutId.CancelTitle]: 'Cancel title edit',
  [ShortcutId.SelectAll]: 'Select all',
  [ShortcutId.Heading4]: 'Heading 4',
  [ShortcutId.Heading5]: 'Heading 5',
  [ShortcutId.Heading6]: 'Heading 6',
  [ShortcutId.NormalTextAlternate]: 'Normal text',
  [ShortcutId.ClearFormatting]: 'Clear formatting',
  [ShortcutId.ZoomIn]: 'Zoom in',
  [ShortcutId.ZoomOut]: 'Zoom out',
  [ShortcutId.ToggleEditsPanel]: 'Show or hide the edits panel',
  [ShortcutId.SummarizeEdits]: 'Summarize edits',
  [ShortcutId.AddComment]: 'Add comment',
  [ShortcutId.NextComment]: 'Next comment',
  [ShortcutId.PreviousComment]: 'Previous comment',
  [ShortcutId.ToggleTrackChanges]: 'Track changes on or off',
  [ShortcutId.Cut]: 'Cut',
  [ShortcutId.Copy]: 'Copy',
  [ShortcutId.Paste]: 'Paste',
  [ShortcutId.PasteWithoutFormatting]: 'Paste without formatting',
  [ShortcutId.InsertFootnote]: 'Insert footnote',
};

export const SHORTCUTS_TITLE = SHORTCUT_LABELS[ShortcutId.ShowShortcuts];
export const SHORTCUTS_DESCRIPTION = 'Word’s keys for editing and formatting. Keys SuperDoc handles on its own are listed too.';
export const SHORTCUTS_SEARCH_LABEL = 'Search shortcuts';
export const SHORTCUTS_EMPTY_MESSAGE = 'No shortcuts match your search.';
export const UNAVAILABLE_SHORTCUT_REASON = 'Not available in this document';

export const PLATFORM_NOTE_LABELS: Record<Platform, string> = {
  [Platform.Mac]: 'Showing Mac keys',
  [Platform.Other]: 'Showing Windows and Linux keys',
};

export const PLATFORM_TOGGLE_LABELS: Record<Platform, string> = {
  [Platform.Mac]: 'Show Windows and Linux keys',
  [Platform.Other]: 'Show Mac keys',
};
