const WORD_PATTERN = /\S+/g;

export function countWords(text: string): number {
  const words = text.match(WORD_PATTERN);
  if (words === null) return 0;
  return words.length;
}
