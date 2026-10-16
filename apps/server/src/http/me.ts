import type { Context } from 'hono';
import type { Auth } from '../auth/auth';
import { readSession } from '../auth/session';

export function createMeHandler({ auth }: { auth: Auth }) {
  return async function me(context: Context): Promise<Response> {
    const user = await readSession({ auth, headers: context.req.raw.headers });
    return context.json({ user });
  };
}
