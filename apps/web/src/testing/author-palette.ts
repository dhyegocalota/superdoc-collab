export const AUTHOR_PALETTE = ['#2e39b8', '#5a2eb8', '#912eb8', '#b82ea8', '#b82e70', '#b82e39'];

export function installAuthorPalette(): void {
  AUTHOR_PALETTE.forEach((color, index) => document.documentElement.style.setProperty(`--author-${index + 1}`, color));
}

export function removeAuthorPalette(): void {
  AUTHOR_PALETTE.forEach((_color, index) => document.documentElement.style.removeProperty(`--author-${index + 1}`));
}
