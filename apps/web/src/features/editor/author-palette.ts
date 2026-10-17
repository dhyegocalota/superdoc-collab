import { AUTHOR_COLOR_SLOT_COUNT, authorColorSlot, type SessionUser } from '@superdoc-collab/types';

class MissingAuthorColorError extends Error {}

function authorColorOf(slot: number): string {
  const color = getComputedStyle(document.documentElement).getPropertyValue(`--author-${slot}`).trim();
  if (color === '') throw new MissingAuthorColorError(`--author-${slot}`);
  return color;
}

export function authorPaletteOf(user: SessionUser): { userColor: string; paletteColors: string[] } {
  return {
    userColor: authorColorOf(authorColorSlot(user.id)),
    paletteColors: Array.from({ length: AUTHOR_COLOR_SLOT_COUNT }, (_, index) => authorColorOf(index + 1)),
  };
}
