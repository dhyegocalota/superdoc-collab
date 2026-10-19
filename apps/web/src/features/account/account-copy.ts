import { ThemePreference } from '../../lib/use-theme';

export const ACCOUNT_SECTION_LABEL = 'Account';
export const WORKSPACE_SECTION_LABEL = 'Workspace';
export const HELP_SECTION_LABEL = 'Help';
export const THEME_LABEL = 'Theme';
export const THEME_LABELS: Record<ThemePreference, string> = {
  [ThemePreference.Light]: 'Light',
  [ThemePreference.Dark]: 'Dark',
  [ThemePreference.System]: 'System',
};

export function accountMenuLabel(name: string): string {
  return `${ACCOUNT_SECTION_LABEL}, ${name}`;
}
