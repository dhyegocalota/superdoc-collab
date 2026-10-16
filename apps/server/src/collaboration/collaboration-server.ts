import { Hocuspocus } from '@hocuspocus/server';
import type { Auth } from '../auth/auth';
import { readSession } from '../auth/session';

const COLLABORATION_SOCKET_TIMEOUT_MS = 10_000;

export const COLLABORATION_TOKEN_PLACEHOLDER = 'session-cookie';

export type CollaborationContext = { userId: string };

export class CollaborationAuthenticationError extends Error {
  constructor() {
    super('No valid session on the collaboration socket.');
  }
}

export function createCollaborationServer({ auth }: { auth: Auth }): Hocuspocus {
  return new Hocuspocus({
    quiet: true,
    timeout: COLLABORATION_SOCKET_TIMEOUT_MS,
    async onAuthenticate({ requestHeaders }): Promise<CollaborationContext> {
      const cookie = requestHeaders.cookie;
      if (!cookie) throw new CollaborationAuthenticationError();
      const user = await readSession({ auth, headers: new Headers({ cookie }) });
      if (!user) throw new CollaborationAuthenticationError();
      return { userId: user.id };
    },
  });
}
