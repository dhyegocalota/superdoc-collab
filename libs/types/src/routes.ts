import { INVITE_QUERY_PARAMETER } from './invites';
import type { UserAction } from './account-access';
import { PASSWORD_RESET_QUERY_PARAMETER, PASSWORD_RESET_SEGMENT } from './password-reset';

export enum AppRoute {
  SignIn = '/sign-in',
  SignUp = '/sign-up',
  ResetPassword = '/reset-password',
  Documents = '/documents',
  Document = '/documents/:documentId',
  Share = '/share/:token',
  Public = '/public/:documentId',
  VersionView = '/documents/:documentId/versions/:sequence/view',
  OAuthConsent = '/oauth/consent',
  ConnectedApps = '/settings/connected-apps',
  Admin = '/admin',
  Settings = '/settings',
  About = '/about',
  // NB ADR 0035: the print route needs no session and holds no document; it only prints what its parent frame hands it.
  Print = '/print',
}

export enum ApiPath {
  Health = '/api/health',
  Me = '/api/me',
  Auth = '/api/auth',
  Collaboration = '/collaboration',
  Documents = '/api/documents',
  ShareLinks = '/api/share-links',
  Mcp = '/api/mcp',
  AgentCollaboration = '/collaboration/agent',
  BootstrapCollaboration = '/collaboration/bootstrap',
  PublicCollaboration = '/collaboration/public',
  Public = '/api/public',
  Setup = '/api/setup',
  Invites = '/api/invites',
  Admin = '/api/admin',
}

export enum AdminResource {
  Users = 'users',
  Invites = 'invites',
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
  Thumbnail = 'thumbnail',
  Public = 'public',
}

export enum VersionResource {
  Text = 'text',
}

export const PUBLIC_SUMMARY_SEGMENT = 'summary';
export const PUBLIC_MEMBERS_SEGMENT = 'members';
export const TAB_QUERY_KEY = 'tab';

const TAB_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isTabId(value: string): boolean {
  return TAB_ID_PATTERN.test(value);
}

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

export function publicPagePath(documentId: string): string {
  return AppRoute.Public.replace(':documentId', encodeURIComponent(documentId));
}

export function publicApiPath(documentId: string): string {
  return `${ApiPath.Public}/${encodeURIComponent(documentId)}`;
}

export function publicSummaryApiPath(documentId: string): string {
  return `${publicApiPath(documentId)}/${PUBLIC_SUMMARY_SEGMENT}`;
}

export function publicMembersApiPath(documentId: string): string {
  return `${publicApiPath(documentId)}/${PUBLIC_MEMBERS_SEGMENT}`;
}

export function shareLinkAcceptPath(token: string): string {
  return `${ApiPath.ShareLinks}/${encodeURIComponent(token)}/accept`;
}

export function memberApiPath({ documentId, userId }: { documentId: string; userId: string }): string {
  return `${documentApiPath({ documentId, resource: DocumentResource.Members })}/${encodeURIComponent(userId)}`;
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

export function adminApiPath(resource: AdminResource): string {
  return `${ApiPath.Admin}/${resource}`;
}

export function signUpPagePath(token: string): string {
  return `${AppRoute.SignUp}?${INVITE_QUERY_PARAMETER}=${encodeURIComponent(token)}`;
}

export function resetPasswordPagePath(token: string): string {
  return `${AppRoute.ResetPassword}?${PASSWORD_RESET_QUERY_PARAMETER}=${encodeURIComponent(token)}`;
}

export const STOP_IMPERSONATING_API_PATH = `${ApiPath.Auth}/admin/stop-impersonating`;

export function userActionApiPath({ userId, action }: { userId: string; action: UserAction }): string {
  return `${adminApiPath(AdminResource.Users)}/${encodeURIComponent(userId)}/${action}`;
}

export function passwordResetApiPath(userId: string): string {
  return `${adminApiPath(AdminResource.Users)}/${encodeURIComponent(userId)}/${PASSWORD_RESET_SEGMENT}`;
}
