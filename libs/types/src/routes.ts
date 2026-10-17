export enum AppRoute {
  SignIn = '/sign-in',
  SignUp = '/sign-up',
  Documents = '/documents',
  Document = '/documents/:documentId',
  Share = '/share/:token',
  VersionView = '/documents/:documentId/versions/:sequence/view',
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
  Timeline = 'timeline',
  Topics = 'topics',
  Summaries = 'summaries',
  Versions = 'versions',
}

export enum VersionResource {
  Text = 'text',
}

const REFRESH_SEGMENT = 'refresh';
const EDITS_SEGMENT = 'edits';
const SELECTION_SEGMENT = 'selection';
const COLLABORATION_VERSIONS_SEGMENT = 'versions';
const VERSION_VIEW_SEGMENT = 'view';

export function documentPagePath(documentId: string): string {
  return `${AppRoute.Documents}/${encodeURIComponent(documentId)}`;
}

export function documentApiPath({ documentId, resource }: { documentId: string; resource?: DocumentResource }): string {
  const base = `${ApiPath.Documents}/${encodeURIComponent(documentId)}`;
  if (!resource) return base;
  return `${base}/${resource}`;
}

export function sharePagePath(token: string): string {
  return `${AppRoute.Share.replace(':token', encodeURIComponent(token))}`;
}

export function shareLinkAcceptPath(token: string): string {
  return `${ApiPath.ShareLinks}/${encodeURIComponent(token)}/accept`;
}

export function topicsRefreshApiPath(documentId: string): string {
  return `${documentApiPath({ documentId, resource: DocumentResource.Topics })}/${REFRESH_SEGMENT}`;
}

export function selectionSummaryApiPath(documentId: string): string {
  return `${documentApiPath({ documentId, resource: DocumentResource.Summaries })}/${SELECTION_SEGMENT}`;
}

export function timelineEditsApiPath(documentId: string): string {
  return `${documentApiPath({ documentId, resource: DocumentResource.Timeline })}/${EDITS_SEGMENT}`;
}

export function versionApiPath({
  documentId,
  sequence,
  resource,
}: {
  documentId: string;
  sequence: number;
  resource?: VersionResource;
}): string {
  const base = `${documentApiPath({ documentId, resource: DocumentResource.Versions })}/${sequence}`;
  if (!resource) return base;
  return `${base}/${resource}`;
}

export function versionCollaborationPath({ documentId, sequence }: { documentId: string; sequence: number }): string {
  return `${ApiPath.Collaboration}/${COLLABORATION_VERSIONS_SEGMENT}/${encodeURIComponent(documentId)}/${sequence}`;
}

export function versionViewPagePath({ documentId, sequence }: { documentId: string; sequence: number }): string {
  return `${documentPagePath(documentId)}/${COLLABORATION_VERSIONS_SEGMENT}/${sequence}/${VERSION_VIEW_SEGMENT}`;
}
