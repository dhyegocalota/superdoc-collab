import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const SOURCE_ROOT = join(import.meta.dirname, '..');
const GLOBALS_PATH = join(import.meta.dirname, 'globals.css');
const THEME_COLOUR_PATTERN = /--color-([a-z0-9-]+):/g;
const CUSTOM_COLOUR_CLASS_PATTERN = /\b(?:bg|text|border|ring|fill|stroke)-(paper(?:-foreground)?|author-[1-6]|active|topic-tint)\b/g;
const COMPONENT_EXTENSION = '.tsx';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!path.endsWith(COMPONENT_EXTENSION) || path.includes('.test.')) return [];
    return [path];
  });
}

test('every custom colour class a component uses has a theme colour in globals.css', () => {
  const themeColours = new Set([...readFileSync(GLOBALS_PATH, 'utf8').matchAll(THEME_COLOUR_PATTERN)].map((match) => match[1]));
  const referenced = new Set(
    sourceFiles(SOURCE_ROOT).flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(CUSTOM_COLOUR_CLASS_PATTERN)].map((match) => match[1]!),
    ),
  );
  expect([...referenced].filter((token) => !themeColours.has(token))).toEqual([]);
});
