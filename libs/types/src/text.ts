export function presentOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return value;
}

export function isBlank(text: string): boolean {
  return text.trim() === '';
}
