import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const GLOBALS_PATH = join(import.meta.dirname, 'globals.css');
const css = readFileSync(GLOBALS_PATH, 'utf8');

const AUTHOR_SLOTS = [1, 2, 3, 4, 5, 6];
const AUTHOR_HEX_VALUES = ['#2e39b8', '#5a2eb8', '#912eb8', '#b82ea8', '#b82e70', '#b82e39'];
const SUPERDOC_VARIABLES: Record<string, string> = {
  '--sd-ui-font-family': 'var(--font-sans)',
  '--sd-ui-text': 'var(--foreground)',
  '--sd-ui-text-muted': 'var(--muted-foreground)',
  '--sd-ui-bg': 'var(--background)',
  '--sd-ui-toolbar-bg': 'var(--background)',
  '--sd-ui-hover-bg': 'var(--accent)',
  '--sd-ui-border': 'var(--border)',
  '--sd-ui-action': 'var(--primary)',
  '--sd-ui-action-hover': 'var(--primary)',
  '--sd-layout-page-bg': 'var(--paper)',
  '--sd-comment-bg': 'var(--card)',
  '--sd-comment-bg-hover': 'var(--popover)',
  '--sd-comment-bg-active': 'var(--popover)',
  '--sd-comment-bg-resolved': 'var(--muted)',
  '--sd-comment-separator': 'var(--border)',
};

function blockOf(selector: string): string {
  const start = css.search(new RegExp(`^\\s*${selector.replace(/[.]/g, '\\.')} \\{`, 'm'));
  if (start < 0) throw new Error(`globals.css has no ${selector} block`);
  return css.slice(start, css.indexOf('\n}', start));
}

function declarationOf({ block, name }: { block: string; name: string }): string | null {
  const match = new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm').exec(block);
  return match ? match[1]!.trim() : null;
}

const rootBlock = blockOf(':root');
const darkBlock = blockOf('.dark');
const themeBlock = blockOf('@theme inline');

test('--paper is oklch(1 0 0) in :root and .dark', () => {
  expect(declarationOf({ block: rootBlock, name: '--paper' })).toBe('oklch(1 0 0)');
  expect(declarationOf({ block: darkBlock, name: '--paper' })).toBe('oklch(1 0 0)');
});

test('dark --primary is oklch(0.55 0.2 263)', () => {
  expect(declarationOf({ block: darkBlock, name: '--primary' })).toBe('oklch(0.55 0.2 263)');
});

test('--author-1 to --author-6 are the six hex values in :root only', () => {
  const rootValues = AUTHOR_SLOTS.map((slot) => declarationOf({ block: rootBlock, name: `--author-${slot}` }));
  const darkValues = AUTHOR_SLOTS.map((slot) => declarationOf({ block: darkBlock, name: `--author-${slot}` }));
  expect(rootValues).toEqual(AUTHOR_HEX_VALUES);
  expect(darkValues).toEqual(AUTHOR_SLOTS.map(() => null));
});

test('--topic-tint-lightness is 94% in light and 22% in dark', () => {
  expect(declarationOf({ block: rootBlock, name: '--topic-tint-lightness' })).toBe('94%');
  expect(declarationOf({ block: darkBlock, name: '--topic-tint-lightness' })).toBe('22%');
});

test('Tailwind gets bg-paper and bg-author-1 to bg-author-6 colours', () => {
  expect(declarationOf({ block: themeBlock, name: '--color-paper' })).toBe('var(--paper)');
  AUTHOR_SLOTS.forEach((slot) =>
    expect(declarationOf({ block: themeBlock, name: `--color-author-${slot}` })).toBe(`var(--author-${slot})`),
  );
});

test('.topic-tint paints the topic hue at the tint lightness', () => {
  expect(declarationOf({ block: blockOf('.topic-tint'), name: 'background-color' })).toBe(
    'hsl(var(--topic-hue) var(--topic-saturation) var(--topic-tint-lightness))',
  );
});

test('SuperDoc chrome variables point at our tokens on html:root, which beats the SuperDoc :root rule', () => {
  const superdocBlock = blockOf('html:root');
  const mapped = Object.fromEntries(Object.keys(SUPERDOC_VARIABLES).map((name) => [name, declarationOf({ block: superdocBlock, name })]));
  expect(mapped).toEqual(SUPERDOC_VARIABLES);
});

test('no SuperDoc variable stays on the plain :root rule', () => {
  const stayedOnRoot = Object.keys(SUPERDOC_VARIABLES).filter((name) => declarationOf({ block: rootBlock, name }) !== null);
  expect(stayedOnRoot).toEqual([]);
});

const MINIMUM_TEXT_CONTRAST = 4.5;
const DARK_TRACKED_CHANGE_COLORS = { '--sd-comment-tc-insert-color': '#4ade80', '--sd-comment-tc-delete-color': '#f87171' };
const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722];
const LUMINANCE_OFFSET = 0.05;

function luminanceOfHex(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return linear.reduce((sum, channel, index) => sum + channel * LUMINANCE_WEIGHTS[index]!, 0);
}

test('dark tracked-change text is mapped on the winning block and reaches AA on the dark card', () => {
  const darkSuperdocBlock = blockOf('html:root.dark');
  const darkCardLightness = Number(/oklch\(([\d.]+) 0 0\)/.exec(declarationOf({ block: darkBlock, name: '--card' })!)![1]);
  const cardLuminance = darkCardLightness ** 3;
  const mapped = Object.fromEntries(
    Object.keys(DARK_TRACKED_CHANGE_COLORS).map((name) => [name, declarationOf({ block: darkSuperdocBlock, name })]),
  );
  expect(mapped).toEqual(DARK_TRACKED_CHANGE_COLORS);
  Object.values(DARK_TRACKED_CHANGE_COLORS).forEach((hex) =>
    expect((luminanceOfHex(hex) + LUMINANCE_OFFSET) / (cardLuminance + LUMINANCE_OFFSET)).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST),
  );
});
