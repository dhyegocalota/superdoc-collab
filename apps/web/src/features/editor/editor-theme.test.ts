import { expect, test } from 'vitest';
import {
  contrastRatio,
  DEFAULT_EDITOR_THEME_CHOICE,
  EditorThemePreset,
  editorThemeConfig,
  parseEditorThemeChoice,
  PRESET_ACCENTS,
  readableTextOn,
  serializeEditorThemeChoice,
} from './editor-theme';

const MIN_CONTRAST = 4.5;

test('a stored preset name or a hex colour parses, anything else does not', () => {
  expect(parseEditorThemeChoice('ocean')).toEqual({ preset: EditorThemePreset.Ocean });
  expect(parseEditorThemeChoice('#aabbcc')).toEqual({ accent: '#aabbcc' });
  expect(parseEditorThemeChoice('sepia')).toBeNull();
  expect(parseEditorThemeChoice('#abc')).toBeNull();
  expect(parseEditorThemeChoice('')).toBeNull();
});

test('a choice serializes to the value it parses from', () => {
  expect(serializeEditorThemeChoice({ preset: EditorThemePreset.Forest })).toBe('forest');
  expect(serializeEditorThemeChoice({ accent: '#123456' })).toBe('#123456');
});

test('Default has no theme, so the app keeps its own look', () => {
  expect(editorThemeConfig(DEFAULT_EDITOR_THEME_CHOICE)).toBeNull();
});

const ACCENT_PRESETS = [EditorThemePreset.Ocean, EditorThemePreset.Forest, EditorThemePreset.Sunset, EditorThemePreset.Mono] as const;

test.each(ACCENT_PRESETS)('%s writes a light and a dark accent', (preset) => {
  const { light, dark } = PRESET_ACCENTS[preset];
  expect(editorThemeConfig({ preset })?.vars?.['--sd-editor-accent']).toBe(`light-dark(${light}, ${dark})`);
});

test('a custom accent is the same in light and dark', () => {
  expect(editorThemeConfig({ accent: '#336699' })?.vars?.['--sd-editor-accent']).toBe('light-dark(#336699, #336699)');
});

test.each(ACCENT_PRESETS)('%s tints the toolbar from the accent in every state', (preset) => {
  const variables = editorThemeConfig({ preset })?.vars;
  expect(variables?.['--sd-editor-tint']).toContain('var(--sd-editor-accent)');
  expect(variables?.['--sd-editor-tint-hover']).toContain('var(--sd-editor-accent)');
  expect(variables?.['--sd-editor-tint-active']).toContain('var(--sd-editor-accent)');
});

test.each(ACCENT_PRESETS)('%s has at least 4.5:1 between its text and its accent, light and dark', (preset) => {
  const { light, dark } = PRESET_ACCENTS[preset];
  expect(contrastRatio({ foreground: readableTextOn(light), background: light })).toBeGreaterThanOrEqual(MIN_CONTRAST);
  expect(contrastRatio({ foreground: readableTextOn(dark), background: dark })).toBeGreaterThanOrEqual(MIN_CONTRAST);
});

test('the text on a mid grey is the one with the higher contrast', () => {
  expect(readableTextOn('#767676')).toBe('#ffffff');
});

test('the text on an accent is dark on a light colour and light on a dark one', () => {
  expect(readableTextOn('#ffffff')).toBe('#0a0a0a');
  expect(readableTextOn('#000000')).toBe('#ffffff');
});
