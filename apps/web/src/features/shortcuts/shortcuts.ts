import type { BuiltInCommandId } from 'superdoc/ui';

export enum ShortcutModifier {
  Mod = 'mod',
  Shift = 'shift',
  Alt = 'alt',
}

export enum ShortcutGroup {
  Editing = 'editing',
  Formatting = 'formatting',
  Paragraph = 'paragraph',
  Navigation = 'navigation',
  Document = 'document',
  App = 'app',
}

export enum ShortcutActionKind {
  Native = 'native',
  Command = 'command',
  App = 'app',
}

export enum ShortcutId {
  Undo = 'undo',
  Redo = 'redo',
  RedoAlternate = 'redo-alternate',
  Bold = 'bold',
  Italic = 'italic',
  Underline = 'underline',
  Strikethrough = 'strikethrough',
  FontGrow = 'font-grow',
  FontShrink = 'font-shrink',
  Link = 'link',
  AlignLeft = 'align-left',
  AlignCenter = 'align-center',
  AlignRight = 'align-right',
  AlignJustify = 'align-justify',
  BulletedList = 'bulleted-list',
  NumberedList = 'numbered-list',
  Heading1 = 'heading-1',
  Heading2 = 'heading-2',
  Heading3 = 'heading-3',
  NormalText = 'normal-text',
  Indent = 'indent',
  Outdent = 'outdent',
  Find = 'find',
  LeaveEditor = 'leave-editor',
  DownloadDocx = 'download-docx',
  DownloadPdf = 'download-pdf',
  ShowShortcuts = 'show-shortcuts',
  ShowShortcutsOutsideField = 'show-shortcuts-outside-field',
}

export type KeyCombination = { modifiers: readonly ShortcutModifier[]; code: string; label: string };
export type ShortcutKeys = { mac: KeyCombination; other: KeyCombination };

export type ShortcutAction =
  | { kind: ShortcutActionKind.Native }
  | { kind: ShortcutActionKind.Command; commandId: BuiltInCommandId; payload?: string }
  | { kind: ShortcutActionKind.App };

export type ShortcutDefinition = { id: ShortcutId; group: ShortcutGroup; keys: ShortcutKeys; action: ShortcutAction };

export const SHORTCUTS: readonly ShortcutDefinition[] = [];

export function shortcutOf(id: ShortcutId): ShortcutDefinition {
  throw new Error(`shortcutOf is not implemented for ${id}`);
}
