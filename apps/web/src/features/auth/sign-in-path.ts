import { AppRoute } from '@superdoc-collab/types';

export function signInPathFor({ pathname, search }: { pathname: string; search: string }): string {
  return `${AppRoute.SignIn}?next=${encodeURIComponent(pathname + search)}`;
}
