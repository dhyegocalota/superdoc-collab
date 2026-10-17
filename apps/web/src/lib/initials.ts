const INITIALS_LIMIT = 2;

export function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((part) => part.charAt(0))
    .slice(0, INITIALS_LIMIT)
    .join('')
    .toUpperCase();
}
