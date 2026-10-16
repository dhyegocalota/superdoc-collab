import { describe, expect, test } from 'vitest';
import { CLIENT_ADDRESS_HEADER, withClientAddress } from './client-address';

const remoteAddress = '192.168.1.5';

function requestWith(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/auth/sign-in/email', { method: 'POST', headers });
}

describe('withClientAddress', () => {
  test('ignores a spoofed x-forwarded-for when the proxy is not trusted', () => {
    const request = withClientAddress({ request: requestWith({ 'x-forwarded-for': '6.6.6.6' }), remoteAddress, trustProxy: false });
    expect(request.headers.get(CLIENT_ADDRESS_HEADER)).toBe(remoteAddress);
  });
  test('takes the first forwarded address when the proxy is trusted', () => {
    const request = withClientAddress({ request: requestWith({ 'x-forwarded-for': '7.7.7.7, 10.0.0.1' }), remoteAddress, trustProxy: true });
    expect(request.headers.get(CLIENT_ADDRESS_HEADER)).toBe('7.7.7.7');
  });
  test('uses the remote address when the proxy is trusted but sent no forwarded header', () => {
    const request = withClientAddress({ request: requestWith({}), remoteAddress, trustProxy: true });
    expect(request.headers.get(CLIENT_ADDRESS_HEADER)).toBe(remoteAddress);
  });
  test.each([true, false])('discards an incoming x-client-ip with trustProxy %s', (trustProxy) => {
    const request = withClientAddress({ request: requestWith({ [CLIENT_ADDRESS_HEADER]: '9.9.9.9' }), remoteAddress, trustProxy });
    expect(request.headers.get(CLIENT_ADDRESS_HEADER)).toBe(remoteAddress);
  });
  test('keeps the body readable', async () => {
    const original = new Request('http://localhost/x', { method: 'POST', body: '{"a":1}' });
    const request = withClientAddress({ request: original, remoteAddress, trustProxy: false });
    expect(await request.text()).toBe('{"a":1}');
  });
});
