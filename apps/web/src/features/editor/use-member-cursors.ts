import { authorColorSlot, CURSOR_GLOW_MS, type DocumentMember } from '@superdoc-collab/types';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SuperDoc } from 'superdoc';
import { authorColorOf } from './author-palette';

const CARET_SELECTOR = '.v2-collaboration-overlay__remote-caret';
const LABEL_SELECTOR = '.v2-collaboration-overlay__remote-label';
const SELECTION_SELECTOR = '.v2-collaboration-overlay__remote-selection';
const OVERLAY_SELECTOR = '[data-v2-collaboration-overlay="true"]';
const PEER_RANK_ATTRIBUTE = 'data-peer-rank';
const GLOW_CLASS = 'member-glow';
const NO_KEYS: readonly string[] = [];

export enum JumpOutcome {
  Jumped = 'jumped',
  NotFound = 'not-found',
}

type MemberCursors = { hasCursor: (member: DocumentMember) => boolean; jumpTo: (member: DocumentMember) => JumpOutcome };

const normalizedPaletteColors = new Map<string, string>();

function normalizedPaletteColor(color: string): string {
  const known = normalizedPaletteColors.get(color);
  if (known !== undefined) return known;
  const probe = document.createElement('span');
  probe.style.color = color;
  normalizedPaletteColors.set(color, probe.style.color);
  return probe.style.color;
}

function cursorKey({ name, color }: { name: string; color: string }): string {
  return JSON.stringify([name, color]);
}

function memberKey(member: DocumentMember): string {
  return cursorKey({ name: member.user.name, color: normalizedPaletteColor(authorColorOf(authorColorSlot(member.user.id))) });
}

function caretsIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(CARET_SELECTOR));
}

function caretKeyOf(caret: HTMLElement): string | null {
  const label = caret.querySelector(LABEL_SELECTOR);
  if (!label || label.textContent === null) return null;
  return cursorKey({ name: label.textContent, color: caret.style.backgroundColor });
}

function selectionsOf(caret: HTMLElement): Element[] {
  const group = caret.parentElement;
  const rank = caret.getAttribute(PEER_RANK_ATTRIBUTE);
  if (!group || rank === null) return [];
  return Array.from(group.querySelectorAll(SELECTION_SELECTOR)).filter((selection) => selection.getAttribute(PEER_RANK_ATTRIBUTE) === rank);
}

function overlayIn(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(OVERLAY_SELECTOR);
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
    const overlayObserver = new MutationObserver(refresh);
    const parentObserver = new MutationObserver(() => watchCurrentOverlay());
    const containerObserver = new MutationObserver(() => watchCurrentOverlay());
    let watchedOverlay: HTMLElement | null | undefined;
    function watchCurrentOverlay(): void {
      const overlay = overlayIn(container);
      if (overlay === watchedOverlay) return;
      watchedOverlay = overlay;
      overlayObserver.disconnect();
      parentObserver.disconnect();
      containerObserver.disconnect();
      refresh();
      if (!overlay) {
        containerObserver.observe(container, { childList: true, subtree: true });
        return;
      }
      overlayObserver.observe(overlay, { childList: true, subtree: true, characterData: true, attributeFilter: ['style'] });
      if (overlay.parentElement) parentObserver.observe(overlay.parentElement, { childList: true });
    }
    watchCurrentOverlay();
    return () => {
      containerObserver.disconnect();
      parentObserver.disconnect();
      overlayObserver.disconnect();
    };
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
      const selections = selectionsOf(caret);
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
