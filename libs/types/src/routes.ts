export enum AppRoute {
  SignIn = '/sign-in',
  SignUp = '/sign-up',
  Documents = '/documents',
  Document = '/documents/:documentId',
  Share = '/share/:token',
}

export enum ApiPath {
  Health = '/api/health',
  Me = '/api/me',
  Auth = '/api/auth',
  Collaboration = '/collaboration',
  Documents = '/api/documents',
  ShareLinks = '/api/share-links',
}

export enum DocumentResource {
  Events = 'events',
  Members = 'members',
  Download = 'download',
  ShareLinks = 'share-links',
}

export function documentPagePath(documentId: string): string {
  return `${AppRoute.Documents}/${encodeURIComponent(documentId)}`;
}

export function documentApiPath({ documentId, resource }: { documentId: string; resource?: DocumentResource }): string {
  const base = `${ApiPath.Documents}/${encodeURIComponent(documentId)}`;
  if (!resource) return base;
  return `${base}/${resource}`;
}

export function shareLinkAcceptPath(token: string): string {
  return `${ApiPath.ShareLinks}/${encodeURIComponent(token)}/accept`;
}
