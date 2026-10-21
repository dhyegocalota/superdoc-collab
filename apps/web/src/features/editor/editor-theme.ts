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
const LINEAR_THRESHOLD = 0.04045;
const LINEAR_DIVISOR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_DIVISOR = 1.055;
const GAMMA_EXPONENT = 2.4;
const CONTRAST_OFFSET = 0.05;
const TINT_PERCENT = 10;
const TINT_HOVER_PERCENT = 18;
const TINT_ACTIVE_PERCENT = 28;
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

function linearChannelOf({ hex, start }: { hex: string; start: number }): number {
  const channel = parseInt(hex.slice(start, start + CHANNEL_LENGTH), HEX_RADIX) / MAX_CHANNEL;
  if (channel <= LINEAR_THRESHOLD) return channel / LINEAR_DIVISOR;
  return ((channel + GAMMA_OFFSET) / GAMMA_DIVISOR) ** GAMMA_EXPONENT;
}

function luminanceOf(hex: string): number {
  return (
    LUMINANCE_WEIGHTS.red * linearChannelOf({ hex, start: RED_START }) +
    LUMINANCE_WEIGHTS.green * linearChannelOf({ hex, start: GREEN_START }) +
    LUMINANCE_WEIGHTS.blue * linearChannelOf({ hex, start: BLUE_START })
  );
}

export function contrastRatio({ foreground, background }: { foreground: string; background: string }): number {
  const [lighter, darker] = [luminanceOf(foreground), luminanceOf(background)].sort((first, second) => second - first);
  return (lighter! + CONTRAST_OFFSET) / (darker! + CONTRAST_OFFSET);
}

export function readableTextOn(accent: string): string {
  const lightContrast = contrastRatio({ foreground: LIGHT_TEXT_COLOR, background: accent });
  const darkContrast = contrastRatio({ foreground: DARK_TEXT_COLOR, background: accent });
  if (lightContrast >= darkContrast) return LIGHT_TEXT_COLOR;
  return DARK_TEXT_COLOR;
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

function tintOf(percent: number): string {
  return `color-mix(in oklab, var(--sd-editor-accent) ${percent}%, var(--background))`;
}

export function editorThemeConfig(choice: EditorThemeChoice): ThemeConfig | null {
  const accent = accentOf(choice);
  if (!accent) return null;
  return {
    name: THEME_NAME,
    vars: {
      '--sd-editor-accent': `light-dark(${accent.light}, ${accent.dark})`,
      '--sd-editor-accent-hover': `color-mix(in oklab, var(--sd-editor-accent), light-dark(black, white) ${HOVER_MIX_PERCENT}%)`,
      '--sd-editor-tint': tintOf(TINT_PERCENT),
      '--sd-editor-tint-hover': tintOf(TINT_HOVER_PERCENT),
      '--sd-editor-tint-active': tintOf(TINT_ACTIVE_PERCENT),
      '--sd-editor-accent-text': `light-dark(${readableTextOn(accent.light)}, ${readableTextOn(accent.dark)})`,
    },
  };
}

export function swatchTestId(preset: EditorThemePreset): string {
  return `theme-swatch-${preset}`;
}
