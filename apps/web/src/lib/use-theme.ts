import { useEffect, useState } from 'react';

export enum ThemePreference {
  Light = 'light',
  Dark = 'dark',
  System = 'system',
}

export const THEME_STORAGE_KEY = 'superdoc-collab.theme';

const THEME_CHANGE_EVENT = 'superdoc-collab.theme-change';
const DARK_CLASS = 'dark';
const DARK_SYSTEM_QUERY = '(prefers-color-scheme: dark)';

export function isThemePreference(value: unknown): value is ThemePreference {
  return Object.values(ThemePreference).some((preference) => preference === value);
}

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemePreference(stored)) return stored;
    if (stored !== null) localStorage.removeItem(THEME_STORAGE_KEY);
    return ThemePreference.System;
  } catch {
    return ThemePreference.System;
  }
}

function writePreference(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    return;
  }
}

function isDarkFor({ preference, prefersDark }: { preference: ThemePreference; prefersDark: boolean }): boolean {
  if (preference === ThemePreference.System) return prefersDark;
  return preference === ThemePreference.Dark;
}

export function useTheme(): { preference: ThemePreference; choosePreference: (preference: ThemePreference) => void } {
  const [preference, setPreference] = useState(readPreference);

  useEffect(() => {
    const systemQuery = window.matchMedia(DARK_SYSTEM_QUERY);
    function apply(): void {
      document.documentElement.classList.toggle(DARK_CLASS, isDarkFor({ preference, prefersDark: systemQuery.matches }));
    }
    apply();
    systemQuery.addEventListener('change', apply);
    return () => systemQuery.removeEventListener('change', apply);
  }, [preference]);

  useEffect(() => {
    function adoptOtherTabChoice(event: StorageEvent): void {
      const isOtherKey = event.key !== null && event.key !== THEME_STORAGE_KEY;
      if (isOtherKey) return;
      setPreference(readPreference());
    }
    function adoptSameTabChoice(event: Event): void {
      if (!(event instanceof CustomEvent) || !isThemePreference(event.detail)) return;
      setPreference(event.detail);
    }
    window.addEventListener('storage', adoptOtherTabChoice);
    window.addEventListener(THEME_CHANGE_EVENT, adoptSameTabChoice);
    return () => {
      window.removeEventListener('storage', adoptOtherTabChoice);
      window.removeEventListener(THEME_CHANGE_EVENT, adoptSameTabChoice);
    };
  }, []);

  function choosePreference(next: ThemePreference): void {
    writePreference(next);
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: next }));
  }

  return { preference, choosePreference };
}
