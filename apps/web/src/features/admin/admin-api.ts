import {
  AdminResource,
  adminApiPath,
  HttpMethod,
  type AdminUser,
  type CreatedInvite,
  type InviteSummary,
  type UserRole,
} from '@superdoc-history/types';
import { apiGet, apiSend, assertOk, readJson } from '@/lib/api';
import { ADMIN_USERS_SUBJECT, CREATE_INVITE_SUBJECT, INVITES_SUBJECT, REVOKE_INVITE_SUBJECT, SET_ROLE_SUBJECT } from './admin-copy';

export const ADMIN_USERS_QUERY_KEY = ['admin', 'users'];
export const INVITES_QUERY_KEY = ['admin', 'invites'];

const USERS_PATH = adminApiPath(AdminResource.Users);
const INVITES_PATH = adminApiPath(AdminResource.Invites);

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const response = await apiGet(USERS_PATH);
  return readJson<AdminUser[]>({ response, subject: ADMIN_USERS_SUBJECT });
}

export async function fetchInvites(): Promise<InviteSummary[]> {
  const response = await apiGet(INVITES_PATH);
  return readJson<InviteSummary[]>({ response, subject: INVITES_SUBJECT });
}

export async function createInvite(): Promise<CreatedInvite> {
  const response = await apiSend({ path: INVITES_PATH, method: HttpMethod.Post, body: null });
  return readJson<CreatedInvite>({ response, subject: CREATE_INVITE_SUBJECT });
}

export async function revokeInvite(id: string): Promise<void> {
  const response = await apiSend({ path: `${INVITES_PATH}/${encodeURIComponent(id)}`, method: HttpMethod.Delete, body: null });
  assertOk({ response, subject: REVOKE_INVITE_SUBJECT });
}

export async function setUserRole({ id, role }: { id: string; role: UserRole }): Promise<void> {
  const path = `${USERS_PATH}/${encodeURIComponent(id)}/role`;
  const response = await apiSend({ path, method: HttpMethod.Post, body: JSON.stringify({ role }) });
  assertOk({ response, subject: SET_ROLE_SUBJECT });
}
