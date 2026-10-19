import { ThemePreference } from '../../lib/use-theme';

const ACCOUNT_MENU_LABEL = 'Account';
export const THEME_LABEL = 'Theme';
export const THEME_LABELS: Record<ThemePreference, string> = {
  [ThemePreference.Light]: 'Light',
  [ThemePreference.Dark]: 'Dark',
  [ThemePreference.System]: 'System',
};

export function accountMenuLabel(name: string): string {
  return `${ACCOUNT_MENU_LABEL}, ${name}`;
}
