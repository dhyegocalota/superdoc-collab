export enum ThemePreference {
  Light = 'light',
  Dark = 'dark',
  System = 'system',
}

export const THEME_STORAGE_KEY = 'superdoc-collab.theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return Object.values(ThemePreference).some((preference) => preference === value);
}

export function useTheme(): { preference: ThemePreference; choosePreference: (preference: ThemePreference) => void } {
  throw new Error('useTheme is not implemented');
}
