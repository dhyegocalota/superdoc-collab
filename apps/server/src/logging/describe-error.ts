const NEWLINE = '\n';
const SPACE = ' ';

export function describeError(error: unknown): string {
  return String(error).replaceAll(NEWLINE, SPACE);
}
