import { HttpMethod, HttpStatus, INVALID_SHARE_LINK_MESSAGE, shareLinkAcceptPath, type AcceptedShareLink } from '@superdoc-history/types';
import { ApiRequestError, apiSend } from '@/lib/api';

export async function acceptShareLink(token: string): Promise<AcceptedShareLink> {
  const response = await apiSend({ path: shareLinkAcceptPath(token), method: HttpMethod.Post, body: null });
  if (response.status === HttpStatus.NotFound) throw new ApiRequestError(INVALID_SHARE_LINK_MESSAGE);
  if (!response.ok) throw new ApiRequestError(`Accepting the link failed with status ${response.status}`);
  return response.json();
}
