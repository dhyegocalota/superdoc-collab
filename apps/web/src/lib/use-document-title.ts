import { APP_NAME } from './app-copy';

export function pageTitle(title: string | null): string {
  return APP_NAME;
}

export function useDocumentTitle(title: string | null): void {}
