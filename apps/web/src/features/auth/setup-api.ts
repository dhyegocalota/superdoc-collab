import { ApiPath, HttpStatus, INVITE_TOKEN_HEADER, type InviteStatus, type SetupStatus } from '@superdoc-collab/types';
import { ApiRequestError, apiGet, apiGetWithHeaders, readJson } from '@/lib/api';
import { INVITE_SUBJECT, SETUP_SUBJECT } from './auth-copy';

export const SETUP_QUERY_KEY = ['setup'];
export const INVITE_QUERY_KEY = ['invite'];

class InviteNotValidError extends ApiRequestError {}

export async function fetchSetup(): Promise<SetupStatus> {
  const response = await apiGet(ApiPath.Setup);
  return readJson<SetupStatus>({ response, subject: SETUP_SUBJECT });
}

export async function fetchInvite(token: string): Promise<InviteStatus> {
  const response = await apiGetWithHeaders({ path: ApiPath.Invites, headers: { [INVITE_TOKEN_HEADER]: token } });
  if (response.status === HttpStatus.NotFound) throw new InviteNotValidError(INVITE_SUBJECT);
  return readJson<InviteStatus>({ response, subject: INVITE_SUBJECT });
}
