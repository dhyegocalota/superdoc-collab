import { AUTHOR_COLOR_SLOT_COUNT, isBlank, type AuthorColorSlot } from '@superdoc-collab/types';

class MissingAuthorColorError extends Error {}

let authorColors: string[] | null = null;

function readAuthorColors(): string[] {
  const style = getComputedStyle(document.documentElement);
  return Array.from({ length: AUTHOR_COLOR_SLOT_COUNT }, (_, index) => {
    const color = style.getPropertyValue(`--author-${index + 1}`).trim();
    if (isBlank(color)) throw new MissingAuthorColorError(`--author-${index + 1}`);
    return color;
  });
}

export function authorColorOf(slot: number): string {
  if (!authorColors) authorColors = readAuthorColors();
  const color = authorColors[slot - 1];
  if (color === undefined) throw new MissingAuthorColorError(`--author-${slot}`);
  return color;
}

export function authorPaletteOf({ colorSlot }: { colorSlot: AuthorColorSlot }): {
  userColor: string;
  paletteColors: string[];
} {
  return {
    userColor: authorColorOf(colorSlot),
    paletteColors: Array.from({ length: AUTHOR_COLOR_SLOT_COUNT }, (_, index) => authorColorOf(index + 1)),
  };
}
