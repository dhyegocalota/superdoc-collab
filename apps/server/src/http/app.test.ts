import { ApiPath, HttpStatus } from '@superdoc-history/types';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { startTestServer, type TestServer } from '../testing/test-server';

let server: TestServer;
beforeAll(async () => { server = await startTestServer(); });
afterAll(async () => { await server.stop(); });

const credentials = { name: 'Ana', email: 'ana@example.com', password: 'superdoc-demo' };

let nextClientAddress = 0;
function freshClientAddress(): string {
  return `10.0.0.${nextClientAddress++}`;
}
async function signUp(body: typeof credentials): Promise<Response> {
  return fetch(`${server.baseUrl}${ApiPath.Auth}/sign-up/email`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': freshClientAddress() }, body: JSON.stringify(body) });
}
async function signIn({ body, clientAddress = freshClientAddress(), target = server }: { body: { email: string; password: string }; clientAddress?: string; target?: TestServer }): Promise<Response> {
  return fetch(`${target.baseUrl}${ApiPath.Auth}/sign-in/email`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': clientAddress }, body: JSON.stringify(body) });
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
    const signedIn = await signIn({ body: { email: credentials.email, password: credentials.password } });
    expect(signedIn.status).toBe(200);
    const me = await fetch(`${server.baseUrl}${ApiPath.Me}`, { headers: { cookie: cookieOf(signedIn) } });
    expect(await me.json()).toEqual({ user: { id: expect.any(String), name: 'Ana', email: 'ana@example.com' } });
  });
  test('me without a session returns a null user', async () => {
    const response = await fetch(`${server.baseUrl}${ApiPath.Me}`);
    expect(response.status).toBe(HttpStatus.Ok);
    expect(await response.json()).toEqual({ user: null });
  });
  test.each([
    ['a one-character name', { name: 'A', email: 'short@example.com', password: 'superdoc-demo' }],
    ['a blank name', { name: '   ', email: 'blank@example.com', password: 'superdoc-demo' }],
  ])('sign-up with %s is a bad request', async (_label, body) => {
    const response = await signUp(body);
    expect(response.status).toBe(HttpStatus.BadRequest);
    expect(await response.text()).not.toContain('name');
  });
  test('sign-in with a seven-character password is a bad request', async () => {
    const response = await signIn({ body: { email: credentials.email, password: '1234567' } });
    expect(response.status).toBe(HttpStatus.BadRequest);
  });
  test('normalizes email case and whitespace', async () => {
    const response = await signIn({ body: { email: '  ANA@example.com ', password: credentials.password } });
    expect(response.status).toBe(200);
  });
  test('wrong password and unknown email return the same status and body', async () => {
    const wrongPassword = await signIn({ body: { email: credentials.email, password: 'definitely-wrong' } });
    const unknownEmail = await signIn({ body: { email: 'nobody@example.com', password: 'definitely-wrong' } });
    expect(wrongPassword.status).toBe(HttpStatus.Unauthorized);
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
    const attempts = await Promise.all(Array.from({ length: 4 }, () => signIn({ body: { email: 'caio@example.com', password: 'definitely-wrong' }, clientAddress: '10.1.0.1' })));
    expect(attempts.map((response) => response.status)).toContain(429);
    const limited = attempts.find((response) => response.status === 429)!;
    expect(limited.headers.get('x-retry-after')).toMatch(/^\d+$/);
  });
  test('rotating x-forwarded-for does not bypass the limit when the proxy is not trusted', async () => {
    const untrusted = await startTestServer({ trustProxy: false });
    const attempts = await Promise.all(Array.from({ length: 4 }, (_, index) => signIn({ body: { email: 'caio@example.com', password: 'definitely-wrong' }, clientAddress: `10.2.0.${index}`, target: untrusted })));
    await untrusted.stop();
    expect(attempts.map((response) => response.status)).toContain(429);
  });
  test('sign-in and sign-up bodies carry no token while the session cookie is httpOnly', async () => {
    const body = { name: 'Dani', email: 'dani@example.com', password: 'superdoc-demo' };
    const signedUp = await signUp(body);
    const signedIn = await signIn({ body: { email: body.email, password: body.password } });
    expect(await signedUp.json()).not.toHaveProperty('token');
    expect(await signedIn.json()).not.toHaveProperty('token');
    expect(signedIn.headers.getSetCookie().join(';')).toContain('HttpOnly');
  });
});
