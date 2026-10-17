import { useEffect } from 'react';
import { APP_NAME } from './app-copy';

const TITLE_SEPARATOR = ' · ';

export function pageTitle(title: string | null): string {
  if (title === null) return APP_NAME;
  return `${title}${TITLE_SEPARATOR}${APP_NAME}`;
}

export function useDocumentTitle(title: string | null): void {
  useEffect(() => {
    document.title = pageTitle(title);
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}
