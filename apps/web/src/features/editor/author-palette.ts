import { AUTHOR_COLOR_SLOT_COUNT, authorColorSlot, type SessionUser } from '@superdoc-collab/types';

class MissingAuthorColorError extends Error {}

let authorColors: string[] | null = null;

function readAuthorColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  return Array.from({ length: AUTHOR_COLOR_SLOT_COUNT }, (_, index) => {
    const color = style.getPropertyValue(`--author-${index + 1}`).trim();
    if (color === '') throw new MissingAuthorColorError(`--author-${index + 1}`);
    return color;
  });
}

export function authorColorOf(slot: number): string {
  if (!authorColors) authorColors = readAuthorColors();
  const color = authorColors[slot - 1];
  if (color === undefined) throw new MissingAuthorColorError(`--author-${slot}`);
  return color;
}

export function authorPaletteOf(user: SessionUser): { userColor: string; paletteColors: string[] } {
  return {
    userColor: authorColorOf(authorColorSlot(user.id)),
    paletteColors: Array.from({ length: AUTHOR_COLOR_SLOT_COUNT }, (_, index) => authorColorOf(index + 1)),
  };
}
