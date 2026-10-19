import { HttpMethod, STOP_IMPERSONATING_API_PATH } from '@superdoc-collab/types';
import { apiSend, assertOk } from '@/lib/api';
import { STOP_IMPERSONATING_SUBJECT } from './impersonation-copy';

const EMPTY_JSON_BODY = '{}';

export async function stopImpersonating(): Promise<void> {
  const response = await apiSend({ path: STOP_IMPERSONATING_API_PATH, method: HttpMethod.Post, body: EMPTY_JSON_BODY });
  assertOk({ response, subject: STOP_IMPERSONATING_SUBJECT });
}
