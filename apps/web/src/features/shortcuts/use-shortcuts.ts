import { useEffect, useRef } from 'react';
import type { SuperDoc } from 'superdoc';
import { DownloadFormat } from '@/features/editor/download-format';
import { isTypingInField } from '@/lib/keyboard';
import { detectPlatform, Platform } from '@/lib/platform';
import { commandHandleOf } from './shortcut-availability';
import {
  EDITING_SHORTCUT_GROUPS,
  ShortcutActionKind,
  ShortcutId,
  ShortcutModifier,
  SHORTCUTS,
  type KeyCombination,
  type ShortcutDefinition,
} from './shortcuts';

export type UseShortcutsOptions = {
  superdoc: SuperDoc | null;
  canEdit: boolean;
  onDownload: (format: DownloadFormat) => void;
  onShowShortcuts: () => void;
};

type ShortcutRun = { definition: ShortcutDefinition; options: UseShortcutsOptions; event: KeyboardEvent };
type ShortcutRunner = (run: ShortcutRun) => boolean;

const FONT_SIZE_COMMAND_ID = 'font-size';
const FONT_SIZE_STEPS = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const SMALLEST_FONT_SIZE = Math.min(...FONT_SIZE_STEPS);
const LARGEST_FONT_SIZE = Math.max(...FONT_SIZE_STEPS);
const TEXT_CONTROL_SELECTOR = 'input, textarea, select, [contenteditable="true"], [role="document"]';

function isMatch({ event, combination }: { event: KeyboardEvent; combination: KeyCombination }): boolean {
  const isMac = detectPlatform() === Platform.Mac;
  const modifierKey = isMac ? event.metaKey : event.ctrlKey;
  const foreignModifierKey = isMac ? event.ctrlKey : event.metaKey;
  const wants = (modifier: ShortcutModifier) => combination.modifiers.includes(modifier);
  return (
    event.code === combination.code &&
    !foreignModifierKey &&
    modifierKey === wants(ShortcutModifier.Mod) &&
    event.shiftKey === wants(ShortcutModifier.Shift) &&
    event.altKey === wants(ShortcutModifier.Alt)
  );
}

function isOutsideTextControl(target: EventTarget | null): boolean {
  return !(target instanceof HTMLElement && target.matches(TEXT_CONTROL_SELECTOR));
}

function steppedFontSize({ currentSize, direction }: { currentSize: number; direction: 1 | -1 }): number {
  const larger = FONT_SIZE_STEPS.filter((size) => size > currentSize);
  const smaller = FONT_SIZE_STEPS.filter((size) => size < currentSize);
  return direction === 1 ? Math.min(...larger, LARGEST_FONT_SIZE) : Math.max(...smaller, SMALLEST_FONT_SIZE);
}

function fontSizeRunner(direction: 1 | -1): ShortcutRunner {
  return ({ options }) => {
    const handle = commandHandleOf({ superdoc: options.superdoc, commandId: FONT_SIZE_COMMAND_ID });
    if (!handle) return false;
    const currentSize = Number(handle.getState().value);
    if (Number.isNaN(currentSize)) return false;
    handle.execute(String(steppedFontSize({ currentSize, direction })));
    return true;
  };
}

const appRunners: Partial<Record<ShortcutId, ShortcutRunner>> = {
  [ShortcutId.FontGrow]: fontSizeRunner(1),
  [ShortcutId.FontShrink]: fontSizeRunner(-1),
  [ShortcutId.DownloadDocx]: ({ options }) => {
    options.onDownload(DownloadFormat.Docx);
    return true;
  },
  [ShortcutId.DownloadPdf]: ({ options }) => {
    options.onDownload(DownloadFormat.Pdf);
    return true;
  },
  [ShortcutId.ShowShortcuts]: ({ options }) => {
    options.onShowShortcuts();
    return true;
  },
  [ShortcutId.ShowShortcutsOutsideField]: ({ options, event }) => {
    if (!isOutsideTextControl(event.target)) return false;
    options.onShowShortcuts();
    return true;
  },
};

const runners: Record<ShortcutActionKind, ShortcutRunner> = {
  [ShortcutActionKind.Native]: () => false,
  [ShortcutActionKind.Command]: ({ definition, options }) => {
    const { action } = definition;
    if (action.kind !== ShortcutActionKind.Command) return false;
    const handle = commandHandleOf({ superdoc: options.superdoc, commandId: action.commandId });
    if (!handle) return false;
    handle.execute(action.payload);
    return true;
  },
  [ShortcutActionKind.App]: (run) => {
    const appRunner = appRunners[run.definition.id];
    return appRunner ? appRunner(run) : false;
  },
};

export function useShortcuts(options: UseShortcutsOptions): void {
  const optionsRef = useRef(options);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented) return;
      const platform = detectPlatform();
      const definition = SHORTCUTS.find((candidate) => isMatch({ event, combination: candidate.keys[platform] }));
      if (!definition) return;
      const isEditingShortcut = EDITING_SHORTCUT_GROUPS.includes(definition.group);
      const isInert = (isEditingShortcut && !optionsRef.current.canEdit) || isTypingInField(event.target);
      if (isInert) return;
      const isHandled = runners[definition.action.kind]({ definition, options: optionsRef.current, event });
      if (isHandled) event.preventDefault();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
