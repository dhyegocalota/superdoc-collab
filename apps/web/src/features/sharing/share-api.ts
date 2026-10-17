import { HttpMethod, HttpStatus, INVALID_SHARE_LINK_MESSAGE, shareLinkAcceptPath, type AcceptedShareLink } from '@superdoc-collab/types';
import { ApiRequestError, apiSend, readJson } from '@/lib/api';
import { ACCEPT_LINK_SUBJECT } from '@/features/editor/editor-copy';

export async function acceptShareLink(token: string): Promise<AcceptedShareLink> {
  const response = await apiSend({ path: shareLinkAcceptPath(token), method: HttpMethod.Post, body: null });
  if (response.status === HttpStatus.NotFound) throw new ApiRequestError(INVALID_SHARE_LINK_MESSAGE);
  return readJson<AcceptedShareLink>({ response, subject: ACCEPT_LINK_SUBJECT });
}
