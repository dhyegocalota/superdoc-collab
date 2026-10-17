import { CURSOR_GLOW_MS, type DocumentMember } from '@superdoc-collab/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SuperDoc } from 'superdoc';

const CARET_SELECTOR = '.v2-collaboration-overlay__remote-caret';
const LABEL_SELECTOR = '.v2-collaboration-overlay__remote-label';
const SELECTION_SELECTOR = '.v2-collaboration-overlay__remote-selection';
const GLOW_CLASS = 'member-glow';
const NO_NAMES: ReadonlySet<string> = new Set();

export enum JumpOutcome {
  Jumped = 'jumped',
  NotFound = 'not-found',
}

type MemberCursors = { hasCursor: (member: DocumentMember) => boolean; jumpTo: (member: DocumentMember) => JumpOutcome };

function caretsIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(CARET_SELECTOR));
}

function labelOf(caret: HTMLElement): string | null {
  const label = caret.querySelector(LABEL_SELECTOR);
  if (!label) return null;
  return label.textContent;
}

function selectionsBeside(caret: HTMLElement): Element[] {
  const group = caret.parentElement;
  if (!group) return [];
  return Array.from(group.querySelectorAll(SELECTION_SELECTOR));
}

function cursorNamesIn(container: HTMLElement): ReadonlySet<string> {
  return new Set(
    caretsIn(container)
      .map(labelOf)
      .filter((name): name is string => name !== null),
  );
}

function isSameNames({ current, next }: { current: ReadonlySet<string>; next: ReadonlySet<string> }): boolean {
  return current.size === next.size && [...next].every((name) => current.has(name));
}

export function useMemberCursors({ superdoc, container }: { superdoc: SuperDoc | null; container: HTMLElement | null }): MemberCursors {
  const [namesWithCursor, setNamesWithCursor] = useState(NO_NAMES);
  const glowTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    function show(next: ReadonlySet<string>): void {
      setNamesWithCursor((current) => (isSameNames({ current, next }) ? current : next));
    }
    if (!superdoc || !container) {
      show(NO_NAMES);
      return;
    }
    const refresh = () => show(cursorNamesIn(container));
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(container, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [superdoc, container]);

  useEffect(() => {
    const timers = glowTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const jumpTo = useCallback(
    (member: DocumentMember): JumpOutcome => {
      if (!container) return JumpOutcome.NotFound;
      const caret = caretsIn(container).find((candidate) => labelOf(candidate) === member.user.name);
      if (!caret) return JumpOutcome.NotFound;
      caret.scrollIntoView({ block: 'center' });
      const selections = selectionsBeside(caret);
      selections.forEach((selection) => selection.classList.add(GLOW_CLASS));
      const timer = setTimeout(() => {
        selections.forEach((selection) => selection.classList.remove(GLOW_CLASS));
        glowTimers.current.delete(timer);
      }, CURSOR_GLOW_MS);
      glowTimers.current.add(timer);
      return JumpOutcome.Jumped;
    },
    [container],
  );

  void namesWithCursor;
  return {
    hasCursor: () => {
      throw new Error('hasCursor is not implemented');
    },
    jumpTo,
  };
}
