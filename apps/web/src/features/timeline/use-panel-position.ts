export enum PanelPosition {
  Bottom = 'bottom',
  Side = 'side',
}

export const PANEL_POSITION_STORAGE_KEY = 'superdoc-collab.edits-panel';

export function usePanelPosition(): { position: PanelPosition; choosePosition: (position: PanelPosition) => void; canChoose: boolean } {
  throw new Error('usePanelPosition is not implemented');
}
