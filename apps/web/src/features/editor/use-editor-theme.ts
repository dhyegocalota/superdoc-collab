import { createTheme } from 'superdoc';
import { useEffect, useState } from 'react';
import {
  DEFAULT_EDITOR_THEME_CHOICE,
  EDITOR_THEME_STORAGE_KEY,
  editorThemeConfig,
  parseEditorThemeChoice,
  serializeEditorThemeChoice,
  type EditorThemeChoice,
} from './editor-theme';

const EDITOR_THEME_CHANGE_EVENT = 'superdoc-collab.editor-theme-change';

function readChoice(): EditorThemeChoice {
  try {
    const stored = localStorage.getItem(EDITOR_THEME_STORAGE_KEY);
    if (stored === null) return DEFAULT_EDITOR_THEME_CHOICE;
    const choice = parseEditorThemeChoice(stored);
    if (choice) return choice;
    localStorage.removeItem(EDITOR_THEME_STORAGE_KEY);
    return DEFAULT_EDITOR_THEME_CHOICE;
  } catch {
    return DEFAULT_EDITOR_THEME_CHOICE;
  }
}

function writeChoice(choice: EditorThemeChoice): void {
  try {
    localStorage.setItem(EDITOR_THEME_STORAGE_KEY, serializeEditorThemeChoice(choice));
  } catch {
    return;
  }
}

export function useEditorTheme(): { choice: EditorThemeChoice; choose: (choice: EditorThemeChoice) => void } {
  const [choice, setChoice] = useState(readChoice);

  useEffect(() => {
    const config = editorThemeConfig(choice);
    if (!config) return;
    const className = createTheme(config);
    document.documentElement.classList.add(className);
    return () => document.documentElement.classList.remove(className);
  }, [choice]);

  useEffect(() => {
    function adoptOtherTabChoice(event: StorageEvent): void {
      const isOtherKey = event.key !== null && event.key !== EDITOR_THEME_STORAGE_KEY;
      if (isOtherKey) return;
      setChoice(readChoice());
    }
    function adoptSameTabChoice(event: Event): void {
      if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') return;
      const sameTabChoice = parseEditorThemeChoice(event.detail);
      if (!sameTabChoice) return;
      setChoice(sameTabChoice);
    }
    window.addEventListener('storage', adoptOtherTabChoice);
    window.addEventListener(EDITOR_THEME_CHANGE_EVENT, adoptSameTabChoice);
    return () => {
      window.removeEventListener('storage', adoptOtherTabChoice);
      window.removeEventListener(EDITOR_THEME_CHANGE_EVENT, adoptSameTabChoice);
    };
  }, []);

  function choose(next: EditorThemeChoice): void {
    writeChoice(next);
    window.dispatchEvent(new CustomEvent(EDITOR_THEME_CHANGE_EVENT, { detail: serializeEditorThemeChoice(next) }));
  }

  return { choice, choose };
}
