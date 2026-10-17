import { useEffect, useState } from 'react';
import { LARGE_BREAKPOINT_PX, minWidthQuery, WIDE_BREAKPOINT_PX } from '@/lib/breakpoints';

export enum PanelPosition {
  Bottom = 'bottom',
  Side = 'side',
}

export const PANEL_POSITION_STORAGE_KEY = 'superdoc-collab.edits-panel';

const PANEL_POSITION_CHANGE_EVENT = 'superdoc-collab.edits-panel-change';

export function isPanelPosition(value: unknown): value is PanelPosition {
  return Object.values(PanelPosition).some((position) => position === value);
}

function readStoredPosition(): PanelPosition | null {
  try {
    const stored = localStorage.getItem(PANEL_POSITION_STORAGE_KEY);
    if (isPanelPosition(stored)) return stored;
    if (stored !== null) localStorage.removeItem(PANEL_POSITION_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

function writeStoredPosition(position: PanelPosition): void {
  try {
    localStorage.setItem(PANEL_POSITION_STORAGE_KEY, position);
  } catch {
    return;
  }
}

function useMinWidth(pixels: number): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(minWidthQuery(pixels)).matches);

  useEffect(() => {
    const query = window.matchMedia(minWidthQuery(pixels));
    function update(): void {
      setMatches(query.matches);
    }
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, [pixels]);

  return matches;
}

export function usePanelPosition(): { position: PanelPosition; choosePosition: (position: PanelPosition) => void; canChoose: boolean } {
  const [storedPosition, setStoredPosition] = useState(readStoredPosition);
  const canChoose = useMinWidth(LARGE_BREAKPOINT_PX);
  const isWide = useMinWidth(WIDE_BREAKPOINT_PX);

  useEffect(() => {
    function adoptOtherTabChoice(event: StorageEvent): void {
      const isOtherKey = event.key !== null && event.key !== PANEL_POSITION_STORAGE_KEY;
      if (isOtherKey) return;
      setStoredPosition(readStoredPosition());
    }
    function adoptSameTabChoice(event: Event): void {
      if (!(event instanceof CustomEvent) || !isPanelPosition(event.detail)) return;
      setStoredPosition(event.detail);
    }
    window.addEventListener('storage', adoptOtherTabChoice);
    window.addEventListener(PANEL_POSITION_CHANGE_EVENT, adoptSameTabChoice);
    return () => {
      window.removeEventListener('storage', adoptOtherTabChoice);
      window.removeEventListener(PANEL_POSITION_CHANGE_EVENT, adoptSameTabChoice);
    };
  }, []);

  function choosePosition(next: PanelPosition): void {
    writeStoredPosition(next);
    window.dispatchEvent(new CustomEvent(PANEL_POSITION_CHANGE_EVENT, { detail: next }));
  }

  const widthPosition = isWide ? PanelPosition.Side : PanelPosition.Bottom;
  const chosenPosition = storedPosition === null ? widthPosition : storedPosition;
  return { position: canChoose ? chosenPosition : PanelPosition.Bottom, choosePosition, canChoose };
}

export function isPanelOpenByDefault(): boolean {
  return window.matchMedia(minWidthQuery(LARGE_BREAKPOINT_PX)).matches;
}
