import { ApiPath } from '@superdoc-history/types';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startTestServer, type TestServer } from '../testing/test-server';

let server: TestServer;
beforeAll(async () => { server = await startTestServer(); });
afterAll(async () => { await server.stop(); });

const credentials = { name: 'Ana', email: 'ana@example.com', password: 'superdoc-demo' };

async function signUp(body: typeof credentials): Promise<Response> {
  return fetch(`${server.baseUrl}${ApiPath.Auth}/sign-up/email`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
let nextClientAddress = 0;
async function signIn(body: { email: string; password: string }, clientAddress = `10.0.0.${nextClientAddress++}`): Promise<Response> {
  return fetch(`${server.baseUrl}${ApiPath.Auth}/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': clientAddress }, body: JSON.stringify(body) });
}
function cookieOf(response: Response): string {
  return response.headers.getSetCookie().map((cookie) => cookie.split(';')[0]).join('; ');
}

describe('health', () => {
  test('answers ok', async () => {
    const response = await fetch(`${server.baseUrl}${ApiPath.Health}`);
    expect(await response.json()).toEqual({ status: 'ok' });
  });
});

describe('sign-up, sign-in and me', () => {
  test('a new user signs up, signs in and reads itself', async () => {
    expect((await signUp(credentials)).status).toBe(200);
    const signedIn = await signIn({ email: credentials.email, password: credentials.password });
    expect(signedIn.status).toBe(200);
    const me = await fetch(`${server.baseUrl}${ApiPath.Me}`, { headers: { cookie: cookieOf(signedIn) } });
    expect(await me.json()).toEqual({ user: { id: expect.any(String), name: 'Ana', email: 'ana@example.com' } });
  });
  test('me without a session is 401', async () => {
    expect((await fetch(`${server.baseUrl}${ApiPath.Me}`)).status).toBe(401);
  });
  test('normalizes email case and whitespace', async () => {
    const response = await signIn({ email: '  ANA@example.com ', password: credentials.password });
    expect(response.status).toBe(200);
  });
  test('wrong password and unknown email return the same status and body', async () => {
    const wrongPassword = await signIn({ email: credentials.email, password: 'definitely-wrong' });
    const unknownEmail = await signIn({ email: 'nobody@example.com', password: 'definitely-wrong' });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.status).toBe(unknownEmail.status);
    expect(await wrongPassword.text()).toBe(await unknownEmail.text());
  });
  test('concurrent sign-ups with one email leave one user', async () => {
    const body = { name: 'Bruno', email: 'bruno@example.com', password: 'superdoc-demo' };
    await Promise.all([signUp(body), signUp(body), signUp(body)]);
    const count = server.database.sqlite.prepare('SELECT count(*) AS total FROM user WHERE email = ?').get(body.email) as { total: number };
    expect(count.total).toBe(1);
  });
  test('the fourth sign-in within ten seconds is rate limited', async () => {
    const attempts = await Promise.all(Array.from({ length: 4 }, () => signIn({ email: 'caio@example.com', password: 'definitely-wrong' }, '10.1.0.1')));
    expect(attempts.map((response) => response.status)).toContain(429);
    const limited = attempts.find((response) => response.status === 429)!;
    expect(limited.headers.get('x-retry-after')).toMatch(/^\d+$/);
  });
});
