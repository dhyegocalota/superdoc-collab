import type { ThemeConfig } from 'superdoc';

export enum EditorThemePreset {
  Default = 'default',
  Ocean = 'ocean',
  Forest = 'forest',
  Sunset = 'sunset',
  Mono = 'mono',
}

export type EditorThemeChoice = { preset: EditorThemePreset } | { accent: string };

type Accent = { light: string; dark: string };

export const EDITOR_THEME_STORAGE_KEY = 'superdoc-collab.editor-theme';
export const DEFAULT_EDITOR_THEME_CHOICE: EditorThemeChoice = { preset: EditorThemePreset.Default };

export const PRESET_ACCENTS: Record<Exclude<EditorThemePreset, EditorThemePreset.Default>, Accent> = {
  [EditorThemePreset.Ocean]: { light: '#0369a1', dark: '#38bdf8' },
  [EditorThemePreset.Forest]: { light: '#15803d', dark: '#4ade80' },
  [EditorThemePreset.Sunset]: { light: '#c2410c', dark: '#fb923c' },
  [EditorThemePreset.Mono]: { light: '#3f3f46', dark: '#e4e4e7' },
};

export function parseEditorThemeChoice(_stored: string): EditorThemeChoice | null {
  throw new Error('parseEditorThemeChoice is not implemented');
}

export function serializeEditorThemeChoice(_choice: EditorThemeChoice): string {
  throw new Error('serializeEditorThemeChoice is not implemented');
}

export function readableTextOn(_accent: string): string {
  throw new Error('readableTextOn is not implemented');
}

export function editorThemeConfig(_choice: EditorThemeChoice): ThemeConfig | null {
  throw new Error('editorThemeConfig is not implemented');
}
