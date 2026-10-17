const SIGNED_QUERY_PARAMETER = 'sig';

export function signedQuerySearch(search: string): string {
  if (!new URLSearchParams(search).has(SIGNED_QUERY_PARAMETER)) return '';
  return search;
}
