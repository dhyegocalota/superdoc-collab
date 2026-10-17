import { authorColorSlot, CURSOR_GLOW_MS, type DocumentMember } from '@superdoc-collab/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SuperDoc } from 'superdoc';
import { authorColorOf } from './author-palette';

const CARET_SELECTOR = '.v2-collaboration-overlay__remote-caret';
const LABEL_SELECTOR = '.v2-collaboration-overlay__remote-label';
const SELECTION_SELECTOR = '.v2-collaboration-overlay__remote-selection';
const GLOW_CLASS = 'member-glow';
const NO_KEYS: readonly string[] = [];

export enum JumpOutcome {
  Jumped = 'jumped',
  NotFound = 'not-found',
}

type MemberCursors = { hasCursor: (member: DocumentMember) => boolean; jumpTo: (member: DocumentMember) => JumpOutcome };

function normalizedColor(color: string): string {
  const probe = document.createElement('span');
  probe.style.color = color;
  return probe.style.color;
}

function cursorKey({ name, color }: { name: string; color: string }): string {
  return JSON.stringify([name, normalizedColor(color)]);
}

function memberKey(member: DocumentMember): string {
  return cursorKey({ name: member.user.name, color: authorColorOf(authorColorSlot(member.user.id)) });
}

function caretsIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(CARET_SELECTOR));
}

function caretKeyOf(caret: HTMLElement): string | null {
  const label = caret.querySelector(LABEL_SELECTOR);
  if (!label || label.textContent === null) return null;
  return cursorKey({ name: label.textContent, color: caret.style.backgroundColor });
}

function selectionsBeside(caret: HTMLElement): Element[] {
  const group = caret.parentElement;
  if (!group) return [];
  return Array.from(group.querySelectorAll(SELECTION_SELECTOR));
}

function caretKeysIn(container: HTMLElement): string[] {
  return caretsIn(container)
    .map(caretKeyOf)
    .filter((key): key is string => key !== null)
    .sort();
}

function isSameKeys({ current, next }: { current: readonly string[]; next: readonly string[] }): boolean {
  return current.length === next.length && current.every((key, index) => key === next[index]);
}

export function useMemberCursors({ superdoc, container }: { superdoc: SuperDoc | null; container: HTMLElement | null }): MemberCursors {
  const [caretKeys, setCaretKeys] = useState(NO_KEYS);
  const glowTimers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    function show(next: readonly string[]): void {
      setCaretKeys((current) => (isSameKeys({ current, next }) ? current : next));
    }
    if (!superdoc || !container) {
      show(NO_KEYS);
      return;
    }
    const refresh = () => show(caretKeysIn(container));
    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(container, { childList: true, subtree: true, characterData: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
  }, [superdoc, container]);

  useEffect(() => {
    const timers = glowTimers.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  const hasCursor = useCallback(
    (member: DocumentMember): boolean => {
      const key = memberKey(member);
      return caretKeys.filter((caretKey) => caretKey === key).length === 1;
    },
    [caretKeys],
  );

  const jumpTo = useCallback(
    (member: DocumentMember): JumpOutcome => {
      if (!container) return JumpOutcome.NotFound;
      const key = memberKey(member);
      const matches = caretsIn(container).filter((candidate) => caretKeyOf(candidate) === key);
      const [caret] = matches;
      if (!caret || matches.length > 1) return JumpOutcome.NotFound;
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

  return { hasCursor, jumpTo };
}
