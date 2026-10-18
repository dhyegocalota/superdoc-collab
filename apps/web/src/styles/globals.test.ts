import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
  '--sd-ui-active-bg': 'var(--active)',
  '--sd-ui-dropdown-active-bg': 'var(--active)',
  '--sd-ui-menu-item-active-bg': 'var(--active)',
  '--sd-ui-toolbar-button-active-bg': 'var(--active)',
  '--sd-ui-dropdown-hover-bg': 'var(--accent)',
  '--sd-ui-menu-item-hover-bg': 'var(--accent)',
  '--sd-ui-toolbar-button-hover-bg': 'var(--accent)',
  '--sd-ui-comments-option-hover-bg': 'var(--accent)',
  '--sd-ui-dropdown-bg': 'var(--popover)',
  '--sd-ui-menu-bg': 'var(--popover)',
  '--sd-ui-surface-bg': 'var(--popover)',
  '--sd-ui-tooltip-bg': 'var(--popover)',
  '--sd-ui-tools-item-bg': 'var(--popover)',
  '--sd-ui-dropdown-border': 'var(--border)',
  '--sd-ui-menu-border': 'var(--border)',
  '--sd-ui-comments-separator': 'var(--border)',
  '--sd-ui-comments-input-border': 'var(--border)',
  '--sd-ui-menu-header-bg': 'var(--muted)',
  '--sd-ui-menu-text-muted': 'var(--muted-foreground)',
  '--sd-ui-text-disabled': 'var(--muted-foreground)',
  '--sd-ui-comments-timestamp-text': 'var(--muted-foreground)',
  '--sd-ui-toolbar-button-text': 'var(--foreground)',
  '--sd-ui-tooltip-text': 'var(--popover-foreground)',
  '--sd-ui-action-text': 'var(--primary-foreground)',
  '--sd-ui-comments-input-bg': 'var(--card)',
  '--sd-ui-comments-tag-bg': 'var(--muted)',
  '--sd-ui-disabled-bg': 'var(--muted)',
  '--sd-ui-dropdown-shadow': 'var(--shadow-popover)',
  '--sd-ui-menu-shadow': 'var(--shadow-popover)',
  '--sd-ui-tooltip-shadow': 'var(--shadow-popover)',
  '--sd-ui-surface-shadow': 'var(--shadow-popover)',
  '--sd-ui-comments-card-shadow': 'var(--shadow-popover)',
  '--sd-ui-comments-dropdown-shadow': 'var(--shadow-popover)',
};
const SHADOW_BY_THEME = { light: '0 8px 24px oklch(0 0 0 / 0.16)', dark: '0 4px 16px oklch(0 0 0 / 0.35)' };
const PAPER_FOREGROUND = 'oklch(0.145 0 0)';
const ACTIVE_BY_THEME = { light: 'oklch(0.86 0 0)', dark: 'oklch(0.37 0 0)' };
const CARET_SELECTOR = "[data-v2-local-selection-caret='true']";

function blockOf(selector: string): string {
  const start = css.search(new RegExp(`^\\s*${selector.replace(/[.[\]]/g, '\\$&')} \\{`, 'm'));
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

const DARK_COMMENT_HIGHLIGHT = '#4ade804d';
const DARK_COMMENT_HIGHLIGHT_VARIABLES = ['--sd-comment-highlight-internal', '--sd-comment-highlight-external'];
const PAGE_TEXT_LUMINANCE = 0;
const FULL_CHANNEL = 255;
const ALPHA_START = 7;

function luminanceOverWhite(hexWithAlpha: string): number {
  const alpha = parseInt(hexWithAlpha.slice(ALPHA_START, ALPHA_START + 2), 16) / FULL_CHANNEL;
  const blended = [1, 3, 5].map((start) =>
    Math.round(parseInt(hexWithAlpha.slice(start, start + 2), 16) * alpha + FULL_CHANNEL * (1 - alpha)),
  );
  return luminanceOfHex(`#${blended.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`);
}

test('the dark comment highlight is translucent and keeps black page text at AA over the paper', () => {
  const darkSuperdocBlock = blockOf('html:root.dark');
  const mapped = DARK_COMMENT_HIGHLIGHT_VARIABLES.map((name) => declarationOf({ block: darkSuperdocBlock, name }));
  expect(mapped).toEqual(DARK_COMMENT_HIGHLIGHT_VARIABLES.map(() => DARK_COMMENT_HIGHLIGHT));
  const contrast = (luminanceOverWhite(DARK_COMMENT_HIGHLIGHT) + LUMINANCE_OFFSET) / (PAGE_TEXT_LUMINANCE + LUMINANCE_OFFSET);
  expect(contrast).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
});

function grayLightness(value: string): number {
  return Number(/oklch\(([\d.]+) 0 0\)/.exec(value)![1]);
}

function grayContrast({ text, surface }: { text: string; surface: string }): number {
  const [lighter, darker] = [grayLightness(text) ** 3, grayLightness(surface) ** 3].sort((first, second) => second - first);
  return (lighter! + LUMINANCE_OFFSET) / (darker! + LUMINANCE_OFFSET);
}

test('--paper-foreground is oklch(0.145 0 0) in :root and .dark', () => {
  expect(declarationOf({ block: rootBlock, name: '--paper-foreground' })).toBe(PAPER_FOREGROUND);
  expect(declarationOf({ block: darkBlock, name: '--paper-foreground' })).toBe(PAPER_FOREGROUND);
});

test('--active is oklch(0.86 0 0) in light and oklch(0.37 0 0) in dark', () => {
  expect(declarationOf({ block: rootBlock, name: '--active' })).toBe(ACTIVE_BY_THEME.light);
  expect(declarationOf({ block: darkBlock, name: '--active' })).toBe(ACTIVE_BY_THEME.dark);
});

test('--shadow-popover is defined in :root and softer in .dark', () => {
  expect(declarationOf({ block: rootBlock, name: '--shadow-popover' })).toBe(SHADOW_BY_THEME.light);
  expect(declarationOf({ block: darkBlock, name: '--shadow-popover' })).toBe(SHADOW_BY_THEME.dark);
});

test('Tailwind gets bg-active and text-paper-foreground colours', () => {
  expect(declarationOf({ block: themeBlock, name: '--color-active' })).toBe('var(--active)');
  expect(declarationOf({ block: themeBlock, name: '--color-paper-foreground' })).toBe('var(--paper-foreground)');
});

test('.dark sets color-scheme dark', () => {
  expect(declarationOf({ block: darkBlock, name: 'color-scheme' })).toBe('dark');
});

test('the caret takes the paper foreground so it reads on the white paper in both themes', () => {
  expect(declarationOf({ block: blockOf(CARET_SELECTOR), name: 'color' })).toBe('var(--paper-foreground)');
});

test('--foreground on --active reaches AA in both themes', () => {
  const lightForeground = declarationOf({ block: rootBlock, name: '--foreground' })!;
  const darkForeground = declarationOf({ block: darkBlock, name: '--foreground' })!;
  expect(grayContrast({ text: lightForeground, surface: ACTIVE_BY_THEME.light })).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
  expect(grayContrast({ text: darkForeground, surface: ACTIVE_BY_THEME.dark })).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
});

const MINIMUM_ACTIVE_CONTRAST = 1.5;

test('--active stays distinguishable from --background in both themes', () => {
  const lightBackground = declarationOf({ block: rootBlock, name: '--background' })!;
  const darkBackground = declarationOf({ block: darkBlock, name: '--background' })!;
  expect(grayContrast({ text: lightBackground, surface: ACTIVE_BY_THEME.light })).toBeGreaterThanOrEqual(MINIMUM_ACTIVE_CONTRAST);
  expect(grayContrast({ text: ACTIVE_BY_THEME.dark, surface: darkBackground })).toBeGreaterThanOrEqual(MINIMUM_ACTIVE_CONTRAST);
});

test('every mapped SuperDoc variable is declared or consumed in the installed SuperDoc stylesheet', () => {
  const superdocStylesheet = readFileSync(createRequire(import.meta.url).resolve('superdoc/style.css'), 'utf8');
  const undeclared = Object.keys(SUPERDOC_VARIABLES).filter((name) => !new RegExp(`${name}[:,)]`).test(superdocStylesheet));
  expect(undeclared).toEqual([]);
});
