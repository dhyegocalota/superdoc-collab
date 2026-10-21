import type { EditorThemeChoice } from './editor-theme';

export function useEditorTheme(): { choice: EditorThemeChoice; choose: (choice: EditorThemeChoice) => void } {
  throw new Error('useEditorTheme is not implemented');
}
