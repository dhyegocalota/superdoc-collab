import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const GLOBALS_PATH = join(import.meta.dirname, 'globals.css');
const css = readFileSync(GLOBALS_PATH, 'utf8');

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

test('no SuperDoc variable stays on the plain :root rule', () => {
  const stayedOnRoot = Object.keys(SUPERDOC_VARIABLES).filter((name) => declarationOf({ block: rootBlock, name }) !== null);
  expect(stayedOnRoot).toEqual([]);
});

const MINIMUM_TEXT_CONTRAST = 4.5;
const DARK_TRACKED_CHANGE_VARIABLES = ['--sd-comment-tc-insert-color', '--sd-comment-tc-delete-color'];
const LUMINANCE_WEIGHTS = [0.2126, 0.7152, 0.0722];
const LUMINANCE_OFFSET = 0.05;

function luminanceOfHex(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = channels.map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return linear.reduce((sum, channel, index) => sum + channel * LUMINANCE_WEIGHTS[index]!, 0);
}

function requiredDeclaration({ block, name }: { block: string; name: string }): string {
  const value = declarationOf({ block, name });
  if (value === null) throw new Error(`globals.css does not declare ${name}`);
  return value;
}

test('dark tracked-change text reaches AA on the dark card', () => {
  const darkSuperdocBlock = blockOf('html:root.dark');
  const darkCardLightness = Number(/oklch\(([\d.]+) 0 0\)/.exec(requiredDeclaration({ block: darkBlock, name: '--card' }))![1]);
  const cardLuminance = darkCardLightness ** 3;
  DARK_TRACKED_CHANGE_VARIABLES.forEach((name) => {
    const hex = requiredDeclaration({ block: darkSuperdocBlock, name });
    expect((luminanceOfHex(hex) + LUMINANCE_OFFSET) / (cardLuminance + LUMINANCE_OFFSET)).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
  });
});

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

test('the dark comment highlight keeps black page text at AA over the paper', () => {
  const darkSuperdocBlock = blockOf('html:root.dark');
  DARK_COMMENT_HIGHLIGHT_VARIABLES.forEach((name) => {
    const highlight = requiredDeclaration({ block: darkSuperdocBlock, name });
    const contrast = (luminanceOverWhite(highlight) + LUMINANCE_OFFSET) / (PAGE_TEXT_LUMINANCE + LUMINANCE_OFFSET);
    expect(contrast).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
  });
});

function grayLightness(value: string): number {
  return Number(/oklch\(([\d.]+) 0 0\)/.exec(value)![1]);
}

function grayContrast({ first, second }: { first: string; second: string }): number {
  const [lighter, darker] = [grayLightness(first) ** 3, grayLightness(second) ** 3].sort(
    (leftLuminance, rightLuminance) => rightLuminance - leftLuminance,
  );
  return (lighter! + LUMINANCE_OFFSET) / (darker! + LUMINANCE_OFFSET);
}

function themedDeclaration(name: string): { light: string; dark: string } {
  return { light: requiredDeclaration({ block: rootBlock, name }), dark: requiredDeclaration({ block: darkBlock, name }) };
}

test('--foreground on --active reaches AA in both themes', () => {
  const foreground = themedDeclaration('--foreground');
  const active = themedDeclaration('--active');
  expect(grayContrast({ first: foreground.light, second: active.light })).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
  expect(grayContrast({ first: foreground.dark, second: active.dark })).toBeGreaterThanOrEqual(MINIMUM_TEXT_CONTRAST);
});

const MINIMUM_ACTIVE_CONTRAST = 1.5;

test('--active stays distinguishable from --background in both themes', () => {
  const background = themedDeclaration('--background');
  const active = themedDeclaration('--active');
  expect(grayContrast({ first: background.light, second: active.light })).toBeGreaterThanOrEqual(MINIMUM_ACTIVE_CONTRAST);
  expect(grayContrast({ first: active.dark, second: background.dark })).toBeGreaterThanOrEqual(MINIMUM_ACTIVE_CONTRAST);
});

test('every mapped SuperDoc variable is declared or consumed in the installed SuperDoc stylesheet', () => {
  const superdocStylesheet = readFileSync(createRequire(import.meta.url).resolve('superdoc/style.css'), 'utf8');
  const undeclared = Object.keys(SUPERDOC_VARIABLES).filter((name) => !new RegExp(`${name}[:,)]`).test(superdocStylesheet));
  expect(undeclared).toEqual([]);
});
