import { useEffect, useRef, type RefObject } from 'react';
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
  onToggleEditsPanel: () => void;
  onSummarize: () => void;
  onAddComment: () => void;
};

type ShortcutRun = {
  definition: ShortcutDefinition;
  options: UseShortcutsOptions;
  event: KeyboardEvent;
  commentCursorRef: RefObject<number>;
};
type ShortcutRunner = (run: ShortcutRun) => boolean;

const FONT_SIZE_COMMAND_ID = 'font-size';
const FONT_SIZE_STEPS = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 36, 48, 72];
const ZOOM_STEPS = [50, 75, 90, 100, 125, 150, 200];
const NO_COMMENT_VISITED = -1;
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

function steppedValue({ steps, current, direction }: { steps: number[]; current: number; direction: 1 | -1 }): number {
  const larger = steps.filter((step) => step > current);
  const smaller = steps.filter((step) => step < current);
  return direction === 1 ? Math.min(...larger, Math.max(...steps)) : Math.max(...smaller, Math.min(...steps));
}

function zoomRunner(direction: 1 | -1): ShortcutRunner {
  return ({ options }) => {
    if (!options.superdoc) return false;
    const { zoom } = options.superdoc.ui;
    zoom.set(steppedValue({ steps: ZOOM_STEPS, current: zoom.getSnapshot().value, direction }));
    return true;
  };
}

function commentRunner(step: 1 | -1): ShortcutRunner {
  return ({ options, commentCursorRef }) => {
    if (!options.superdoc) return false;
    const { comments } = options.superdoc.ui;
    const commentIds = comments.list().map((comment) => comment.id);
    if (commentIds.length === 0) return false;
    const isFirstBackwardStep = commentCursorRef.current === NO_COMMENT_VISITED && step === -1;
    const from = isFirstBackwardStep ? 0 : commentCursorRef.current;
    commentCursorRef.current = (from + step + commentIds.length) % commentIds.length;
    void comments.scrollTo(commentIds[commentCursorRef.current]!);
    return true;
  };
}

function fontSizeRunner(direction: 1 | -1): ShortcutRunner {
  return ({ options }) => {
    const handle = commandHandleOf({ superdoc: options.superdoc, commandId: FONT_SIZE_COMMAND_ID });
    if (!handle) return false;
    const currentSize = Number(handle.getState().value);
    if (Number.isNaN(currentSize)) return false;
    handle.execute(String(steppedValue({ steps: FONT_SIZE_STEPS, current: currentSize, direction })));
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
  [ShortcutId.ZoomIn]: zoomRunner(1),
  [ShortcutId.ZoomOut]: zoomRunner(-1),
  [ShortcutId.NextComment]: commentRunner(1),
  [ShortcutId.PreviousComment]: commentRunner(-1),
  [ShortcutId.ToggleEditsPanel]: ({ options }) => {
    options.onToggleEditsPanel();
    return true;
  },
  [ShortcutId.SummarizeEdits]: ({ options }) => {
    options.onSummarize();
    return true;
  },
  [ShortcutId.AddComment]: ({ options }) => {
    if (!options.superdoc || options.superdoc.ui.selection.getSnapshot().empty) return false;
    options.onAddComment();
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
  const commentCursorRef = useRef(NO_COMMENT_VISITED);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  useEffect(() => {
    function definitionOf(event: KeyboardEvent): ShortcutDefinition | undefined {
      const platform = detectPlatform();
      return SHORTCUTS.find((candidate) => isMatch({ event, combination: candidate.keys[platform] }));
    }

    function swallowHeldKey(event: KeyboardEvent): void {
      if (!event.repeat || event.defaultPrevented || isTypingInField(event.target)) return;
      if (!definitionOf(event)?.ignoresRepeat) return;
      event.preventDefault();
      event.stopPropagation();
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.defaultPrevented) return;
      const definition = definitionOf(event);
      if (!definition) return;
      const isEditingShortcut = EDITING_SHORTCUT_GROUPS.includes(definition.group);
      const isInert = (isEditingShortcut && !optionsRef.current.canEdit) || isTypingInField(event.target);
      if (isInert) return;
      const isHandled = runners[definition.action.kind]({ definition, options: optionsRef.current, event, commentCursorRef });
      if (isHandled) event.preventDefault();
    }
    document.addEventListener('keydown', swallowHeldKey, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', swallowHeldKey, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);
}
