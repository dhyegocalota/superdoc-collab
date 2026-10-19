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
  Title = 'title',
  Review = 'review',
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
  SaveTitle = 'save-title',
  CancelTitle = 'cancel-title',
  SelectAll = 'select-all',
  Heading4 = 'heading-4',
  Heading5 = 'heading-5',
  Heading6 = 'heading-6',
  NormalTextAlternate = 'normal-text-alternate',
  ClearFormatting = 'clear-formatting',
  ZoomIn = 'zoom-in',
  ZoomOut = 'zoom-out',
  ToggleEditsPanel = 'toggle-edits-panel',
  SummarizeEdits = 'summarize-edits',
  AddComment = 'add-comment',
  NextComment = 'next-comment',
  PreviousComment = 'previous-comment',
  ToggleTrackChanges = 'toggle-track-changes',
}

export type KeyCombination = { modifiers: readonly ShortcutModifier[]; code: string; label: string };
export type ShortcutKeys = { mac: KeyCombination; other: KeyCombination };

export type ShortcutAction =
  | { kind: ShortcutActionKind.Native }
  | { kind: ShortcutActionKind.Command; commandId: BuiltInCommandId; payload?: string }
  | { kind: ShortcutActionKind.App };

export type ShortcutDefinition = {
  id: ShortcutId;
  group: ShortcutGroup;
  keys: ShortcutKeys;
  action: ShortcutAction;
  ignoresRepeat: boolean;
};

export const EDITING_SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  ShortcutGroup.Editing,
  ShortcutGroup.Formatting,
  ShortcutGroup.Paragraph,
  ShortcutGroup.Title,
  ShortcutGroup.Review,
];

const ESCAPE_KEY_LABEL = 'Esc';
const ENTER_KEY_LABEL = 'Enter';
const SPACE_KEY_LABEL = 'Space';
const { Mod, Shift, Alt } = ShortcutModifier;
const NATIVE: ShortcutAction = { kind: ShortcutActionKind.Native };
const APP: ShortcutAction = { kind: ShortcutActionKind.App };

function command({ commandId, payload }: { commandId: BuiltInCommandId; payload?: string }): ShortcutAction {
  return { kind: ShortcutActionKind.Command, commandId, payload };
}

function letter(character: string): Pick<KeyCombination, 'code' | 'label'> {
  return { code: `Key${character}`, label: character };
}

function digit(character: string): Pick<KeyCombination, 'code' | 'label'> {
  return { code: `Digit${character}`, label: character };
}

function definition({
  id,
  group,
  action,
  modifiers,
  code,
  label,
  mac,
  ignoresRepeat = false,
}: Omit<ShortcutDefinition, 'keys' | 'ignoresRepeat'> &
  KeyCombination & { mac?: KeyCombination; ignoresRepeat?: boolean }): ShortcutDefinition {
  const combination: KeyCombination = { modifiers, code, label };
  return { id, group, action, ignoresRepeat, keys: { mac: mac ? mac : combination, other: combination } };
}

export const SHORTCUTS: readonly ShortcutDefinition[] = [
  definition({ id: ShortcutId.Undo, group: ShortcutGroup.Editing, action: NATIVE, modifiers: [Mod], ...letter('Z') }),
  definition({ id: ShortcutId.Redo, group: ShortcutGroup.Editing, action: NATIVE, modifiers: [Mod], ...letter('Y') }),
  definition({ id: ShortcutId.RedoAlternate, group: ShortcutGroup.Editing, action: NATIVE, modifiers: [Mod, Shift], ...letter('Z') }),
  definition({
    id: ShortcutId.Bold,
    group: ShortcutGroup.Formatting,
    action: NATIVE,
    modifiers: [Mod],
    ...letter('B'),
    ignoresRepeat: true,
  }),
  definition({
    id: ShortcutId.Italic,
    group: ShortcutGroup.Formatting,
    action: NATIVE,
    modifiers: [Mod],
    ...letter('I'),
    ignoresRepeat: true,
  }),
  definition({
    id: ShortcutId.Underline,
    group: ShortcutGroup.Formatting,
    action: NATIVE,
    modifiers: [Mod],
    ...letter('U'),
    ignoresRepeat: true,
  }),
  definition({
    id: ShortcutId.Strikethrough,
    group: ShortcutGroup.Formatting,
    action: NATIVE,
    modifiers: [Mod, Shift],
    ...letter('X'),
    ignoresRepeat: true,
  }),
  definition({
    id: ShortcutId.FontGrow,
    group: ShortcutGroup.Formatting,
    action: APP,
    modifiers: [Mod, Shift],
    code: 'Period',
    label: '>',
  }),
  definition({
    id: ShortcutId.FontShrink,
    group: ShortcutGroup.Formatting,
    action: APP,
    modifiers: [Mod, Shift],
    code: 'Comma',
    label: '<',
  }),
  definition({ id: ShortcutId.Link, group: ShortcutGroup.Formatting, action: NATIVE, modifiers: [Mod], ...letter('K') }),
  definition({
    id: ShortcutId.AlignLeft,
    group: ShortcutGroup.Paragraph,
    action: command({ commandId: 'text-align', payload: 'left' }),
    modifiers: [Mod],
    ...letter('L'),
  }),
  definition({
    id: ShortcutId.AlignCenter,
    group: ShortcutGroup.Paragraph,
    action: command({ commandId: 'text-align', payload: 'center' }),
    modifiers: [Mod],
    ...letter('E'),
  }),
  definition({
    id: ShortcutId.AlignRight,
    group: ShortcutGroup.Paragraph,
    action: command({ commandId: 'text-align', payload: 'right' }),
    modifiers: [Mod],
    ...letter('R'),
  }),
  definition({
    id: ShortcutId.AlignJustify,
    group: ShortcutGroup.Paragraph,
    action: command({ commandId: 'text-align', payload: 'justify' }),
    modifiers: [Mod],
    ...letter('J'),
  }),
  definition({
    id: ShortcutId.BulletedList,
    group: ShortcutGroup.Paragraph,
    action: NATIVE,
    modifiers: [Mod, Shift],
    ...digit('8'),
    ignoresRepeat: true,
  }),
  definition({
    id: ShortcutId.NumberedList,
    group: ShortcutGroup.Paragraph,
    action: NATIVE,
    modifiers: [Mod, Shift],
    ...digit('7'),
    ignoresRepeat: true,
  }),
  definition({ id: ShortcutId.Heading1, group: ShortcutGroup.Paragraph, action: NATIVE, modifiers: [Mod, Alt], ...digit('1') }),
  definition({ id: ShortcutId.Heading2, group: ShortcutGroup.Paragraph, action: NATIVE, modifiers: [Mod, Alt], ...digit('2') }),
  definition({ id: ShortcutId.Heading3, group: ShortcutGroup.Paragraph, action: NATIVE, modifiers: [Mod, Alt], ...digit('3') }),
  definition({
    id: ShortcutId.NormalText,
    group: ShortcutGroup.Paragraph,
    action: command({ commandId: 'linked-style', payload: 'Normal' }),
    modifiers: [Mod, Shift],
    ...letter('N'),
  }),
  definition({
    id: ShortcutId.Indent,
    group: ShortcutGroup.Paragraph,
    action: command({ commandId: 'indent-increase' }),
    modifiers: [Mod],
    ...letter('M'),
    mac: { modifiers: [Mod], code: 'BracketRight', label: ']' },
  }),
  definition({
    id: ShortcutId.Outdent,
    group: ShortcutGroup.Paragraph,
    action: command({ commandId: 'indent-decrease' }),
    modifiers: [Mod, Shift],
    ...letter('M'),
    mac: { modifiers: [Mod], code: 'BracketLeft', label: '[' },
  }),
  definition({ id: ShortcutId.Find, group: ShortcutGroup.Navigation, action: NATIVE, modifiers: [Mod], ...letter('F') }),
  definition({
    id: ShortcutId.LeaveEditor,
    group: ShortcutGroup.Navigation,
    action: NATIVE,
    modifiers: [],
    code: 'Escape',
    label: ESCAPE_KEY_LABEL,
  }),
  definition({
    id: ShortcutId.DownloadDocx,
    group: ShortcutGroup.Document,
    action: APP,
    modifiers: [Mod],
    ...letter('S'),
    ignoresRepeat: true,
  }),
  definition({
    id: ShortcutId.DownloadPdf,
    group: ShortcutGroup.Document,
    action: APP,
    modifiers: [Mod],
    ...letter('P'),
    ignoresRepeat: true,
  }),
  definition({
    id: ShortcutId.ShowShortcuts,
    group: ShortcutGroup.App,
    action: APP,
    modifiers: [Mod],
    code: 'Slash',
    label: '/',
    ignoresRepeat: true,
  }),
  definition({
    id: ShortcutId.ShowShortcutsOutsideField,
    group: ShortcutGroup.App,
    action: APP,
    modifiers: [Shift],
    code: 'Slash',
    label: '/',
  }),
  definition({
    id: ShortcutId.SaveTitle,
    group: ShortcutGroup.Title,
    action: NATIVE,
    modifiers: [],
    code: 'Enter',
    label: ENTER_KEY_LABEL,
  }),
  definition({
    id: ShortcutId.CancelTitle,
    group: ShortcutGroup.Title,
    action: NATIVE,
    modifiers: [],
    code: 'Escape',
    label: ESCAPE_KEY_LABEL,
  }),
  definition({ id: ShortcutId.SelectAll, group: ShortcutGroup.Editing, action: NATIVE, modifiers: [Mod], ...letter('A') }),
  definition({ id: ShortcutId.Heading4, group: ShortcutGroup.Paragraph, action: NATIVE, modifiers: [Mod, Alt], ...digit('4') }),
  definition({ id: ShortcutId.Heading5, group: ShortcutGroup.Paragraph, action: NATIVE, modifiers: [Mod, Alt], ...digit('5') }),
  definition({ id: ShortcutId.Heading6, group: ShortcutGroup.Paragraph, action: NATIVE, modifiers: [Mod, Alt], ...digit('6') }),
  definition({
    id: ShortcutId.NormalTextAlternate,
    group: ShortcutGroup.Paragraph,
    action: command({ commandId: 'linked-style', payload: 'Normal' }),
    modifiers: [Mod, Alt],
    ...digit('0'),
  }),
  definition({
    id: ShortcutId.ClearFormatting,
    group: ShortcutGroup.Formatting,
    action: command({ commandId: 'clear-formatting' }),
    modifiers: [Mod],
    code: 'Space',
    label: SPACE_KEY_LABEL,
    mac: { modifiers: [Mod], code: 'Backslash', label: '\\' },
  }),
  definition({ id: ShortcutId.ZoomIn, group: ShortcutGroup.Navigation, action: APP, modifiers: [Mod, Alt], code: 'Equal', label: '=' }),
  definition({ id: ShortcutId.ZoomOut, group: ShortcutGroup.Navigation, action: APP, modifiers: [Mod, Alt], code: 'Minus', label: '-' }),
  definition({
    id: ShortcutId.ToggleEditsPanel,
    group: ShortcutGroup.Navigation,
    action: APP,
    modifiers: [Mod, Alt],
    ...letter('E'),
    ignoresRepeat: true,
  }),
  definition({
    id: ShortcutId.SummarizeEdits,
    group: ShortcutGroup.Review,
    action: APP,
    modifiers: [Mod, Alt],
    ...letter('S'),
    ignoresRepeat: true,
  }),
  definition({
    id: ShortcutId.AddComment,
    group: ShortcutGroup.Review,
    action: APP,
    modifiers: [Mod, Alt],
    ...letter('M'),
    ignoresRepeat: true,
  }),
  definition({
    id: ShortcutId.ToggleTrackChanges,
    group: ShortcutGroup.Review,
    action: APP,
    modifiers: [Mod, Alt],
    ...letter('T'),
    ignoresRepeat: true,
  }),
  definition({ id: ShortcutId.NextComment, group: ShortcutGroup.Review, action: APP, modifiers: [Mod, Alt], ...letter('N') }),
  definition({ id: ShortcutId.PreviousComment, group: ShortcutGroup.Review, action: APP, modifiers: [Mod, Alt], ...letter('P') }),
];

const SHORTCUT_BY_ID: ReadonlyMap<ShortcutId, ShortcutDefinition> = new Map(SHORTCUTS.map((entry) => [entry.id, entry]));

export function shortcutOf(id: ShortcutId): ShortcutDefinition {
  const found = SHORTCUT_BY_ID.get(id);
  if (!found) throw new Error(`no shortcut declared for ${id}`);
  return found;
}

export const READER_SHORTCUT_GROUPS: readonly ShortcutGroup[] = Object.values(ShortcutGroup).filter(
  (group) => !EDITING_SHORTCUT_GROUPS.includes(group),
);
