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

const THEME_NAME = 'editor';
const DEFAULT_PICKER_COLOR = '#1355ff';
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const HOVER_MIX_PERCENT = 15;
const LIGHT_TEXT_COLOR = '#ffffff';
const DARK_TEXT_COLOR = '#0a0a0a';
const LUMINANCE_WEIGHTS = { red: 0.2126, green: 0.7152, blue: 0.0722 };
const LIGHT_BACKGROUND_LUMINANCE = 0.4;
const HEX_RADIX = 16;
const MAX_CHANNEL = 255;
const RED_START = 1;
const GREEN_START = 3;
const BLUE_START = 5;
const CHANNEL_LENGTH = 2;

export const EDITOR_THEME_STORAGE_KEY = 'superdoc-collab.editor-theme';
export const DEFAULT_EDITOR_THEME_CHOICE: EditorThemeChoice = { preset: EditorThemePreset.Default };

export const PRESET_ACCENTS: Record<Exclude<EditorThemePreset, EditorThemePreset.Default>, Accent> = {
  [EditorThemePreset.Ocean]: { light: '#0369a1', dark: '#38bdf8' },
  [EditorThemePreset.Forest]: { light: '#15803d', dark: '#4ade80' },
  [EditorThemePreset.Sunset]: { light: '#c2410c', dark: '#fb923c' },
  [EditorThemePreset.Mono]: { light: '#3f3f46', dark: '#e4e4e7' },
};

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

export function isEditorThemePreset(value: unknown): value is EditorThemePreset {
  return Object.values(EditorThemePreset).some((preset) => preset === value);
}

export function parseEditorThemeChoice(stored: string): EditorThemeChoice | null {
  if (isEditorThemePreset(stored)) return { preset: stored };
  if (isHexColor(stored)) return { accent: stored };
  return null;
}

export function serializeEditorThemeChoice(choice: EditorThemeChoice): string {
  if ('accent' in choice) return choice.accent;
  return choice.preset;
}

function channelOf({ hex, start }: { hex: string; start: number }): number {
  return parseInt(hex.slice(start, start + CHANNEL_LENGTH), HEX_RADIX) / MAX_CHANNEL;
}

export function readableTextOn(accent: string): string {
  const luminance =
    LUMINANCE_WEIGHTS.red * channelOf({ hex: accent, start: RED_START }) +
    LUMINANCE_WEIGHTS.green * channelOf({ hex: accent, start: GREEN_START }) +
    LUMINANCE_WEIGHTS.blue * channelOf({ hex: accent, start: BLUE_START });
  return luminance > LIGHT_BACKGROUND_LUMINANCE ? DARK_TEXT_COLOR : LIGHT_TEXT_COLOR;
}

function accentOf(choice: EditorThemeChoice): Accent | null {
  if ('accent' in choice) return { light: choice.accent, dark: choice.accent };
  if (choice.preset === EditorThemePreset.Default) return null;
  return PRESET_ACCENTS[choice.preset];
}

export function pickerColorOf(choice: EditorThemeChoice): string {
  const accent = accentOf(choice);
  if (!accent) return DEFAULT_PICKER_COLOR;
  return accent.light;
}

export function editorThemeConfig(choice: EditorThemeChoice): ThemeConfig | null {
  const accent = accentOf(choice);
  if (!accent) return null;
  return {
    name: THEME_NAME,
    vars: {
      '--sd-editor-accent': `light-dark(${accent.light}, ${accent.dark})`,
      '--sd-editor-accent-hover': `color-mix(in oklab, var(--sd-editor-accent), light-dark(black, white) ${HOVER_MIX_PERCENT}%)`,
      '--sd-editor-accent-text': `light-dark(${readableTextOn(accent.light)}, ${readableTextOn(accent.dark)})`,
    },
  };
}
