import { HocuspocusProvider, HocuspocusProviderWebsocket } from '@hocuspocus/provider';
import { ApiPath } from '@superdoc-history/types';
import WebSocket from 'ws';
import { describe, expect, test } from 'vitest';
import { COLLABORATION_TOKEN_PLACEHOLDER } from './collaboration-server';
import { signInAndGetCookie, startTestServer } from '../testing/test-server';

const PROBE_DOCUMENT_NAME = 'probe';
const PASSWORD = 'superdoc-demo';

function socketWithCookie({ cookie, origin }: { cookie: string; origin: string }): typeof WebSocket {
  return class extends WebSocket {
    constructor(url: string, protocols?: string | string[]) {
      super(url, protocols, { headers: { cookie }, origin });
    }
  } as unknown as typeof WebSocket;
}

function connect({ url, cookie, origin }: { url: string; cookie: string; origin: string }): Promise<'authenticated' | 'failed'> {
  return new Promise((resolve) => {
    const websocketProvider = new HocuspocusProviderWebsocket({ url, WebSocketPolyfill: socketWithCookie({ cookie, origin }), maxAttempts: 1 });
    const provider = new HocuspocusProvider({
      websocketProvider,
      name: PROBE_DOCUMENT_NAME,
      token: COLLABORATION_TOKEN_PLACEHOLDER,
      onAuthenticated: () => { provider.destroy(); websocketProvider.destroy(); resolve('authenticated'); },
      onAuthenticationFailed: () => { provider.destroy(); websocketProvider.destroy(); resolve('failed'); },
    });
  });
}

describe('collaboration authentication', () => {
  test('accepts a valid session cookie', async () => {
    const server = await startTestServer();
    const cookie = await signInAndGetCookie({ server, credentials: { name: 'Ana', email: 'ana@example.com', password: PASSWORD } });
    expect(await connect({ url: server.baseUrl.replace('http', 'ws') + ApiPath.Collaboration, cookie, origin: server.baseUrl })).toBe('authenticated');
    await server.stop();
  });
  test('rejects a missing cookie', async () => {
    const server = await startTestServer();
    expect(await connect({ url: server.baseUrl.replace('http', 'ws') + ApiPath.Collaboration, cookie: '', origin: server.baseUrl })).toBe('failed');
    await server.stop();
  });
  test('rejects an expired session cookie', async () => {
    const server = await startTestServer();
    const cookie = await signInAndGetCookie({ server, credentials: { name: 'Bruno', email: 'bruno@example.com', password: PASSWORD } });
    server.database.sqlite.prepare('DELETE FROM session').run();
    expect(await connect({ url: server.baseUrl.replace('http', 'ws') + ApiPath.Collaboration, cookie, origin: server.baseUrl })).toBe('failed');
    await server.stop();
  });
});
