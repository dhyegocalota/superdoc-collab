import { expect, test } from 'vitest';
import {
  DEFAULT_EDITOR_THEME_CHOICE,
  EditorThemePreset,
  editorThemeConfig,
  parseEditorThemeChoice,
  PRESET_ACCENTS,
  readableTextOn,
  serializeEditorThemeChoice,
} from './editor-theme';

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

test.each([EditorThemePreset.Ocean, EditorThemePreset.Forest, EditorThemePreset.Sunset, EditorThemePreset.Mono])(
  '%s writes a light and a dark accent',
  (preset) => {
    const { light, dark } = PRESET_ACCENTS[preset];
    expect(editorThemeConfig({ preset })?.vars?.['--sd-editor-accent']).toBe(`light-dark(${light}, ${dark})`);
  },
);

test('a custom accent is the same in light and dark', () => {
  expect(editorThemeConfig({ accent: '#336699' })?.vars?.['--sd-editor-accent']).toBe('light-dark(#336699, #336699)');
});

test('the text on an accent is dark on a light colour and light on a dark one', () => {
  expect(readableTextOn('#ffffff')).toBe('#0a0a0a');
  expect(readableTextOn('#000000')).toBe('#ffffff');
});
