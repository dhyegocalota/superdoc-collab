import { describe, expect, test } from 'vitest';
import { CLIENT_ADDRESS_HEADER, withClientAddress } from './client-address';

const remoteAddress = '192.168.1.5';

function requestWith(headers: Record<string, string>): Request {
  return new Request('http://localhost/api/auth/sign-in/email', { method: 'POST', headers });
}

const trustedProxyHops = 1;

function resolvedAddress({
  headers,
  trustProxy,
  hops = trustedProxyHops,
}: {
  headers: Record<string, string>;
  trustProxy: boolean;
  hops?: number;
}) {
  return withClientAddress({ request: requestWith(headers), remoteAddress, trustProxy, trustedProxyHops: hops }).headers.get(
    CLIENT_ADDRESS_HEADER,
  );
}

describe('withClientAddress', () => {
  test('ignores a spoofed x-forwarded-for when the proxy is not trusted', () => {
    expect(resolvedAddress({ headers: { 'x-forwarded-for': '6.6.6.6' }, trustProxy: false })).toBe(remoteAddress);
  });
  test('takes the rightmost forwarded address with one trusted hop', () => {
    expect(resolvedAddress({ headers: { 'x-forwarded-for': '7.7.7.7' }, trustProxy: true })).toBe('7.7.7.7');
  });
  test('ignores a spoofed leftmost entry the proxy appended to', () => {
    expect(resolvedAddress({ headers: { 'x-forwarded-for': '6.6.6.6, 7.7.7.7' }, trustProxy: true })).toBe('7.7.7.7');
  });
  test('counts two trusted hops from the right', () => {
    expect(resolvedAddress({ headers: { 'x-forwarded-for': '6.6.6.6, 7.7.7.7, 10.0.0.1' }, trustProxy: true, hops: 2 })).toBe('7.7.7.7');
  });
  test('uses the remote address when the header has fewer entries than trusted hops', () => {
    expect(resolvedAddress({ headers: { 'x-forwarded-for': '7.7.7.7' }, trustProxy: true, hops: 2 })).toBe(remoteAddress);
  });
  test('uses the remote address when the proxy is trusted but sent no forwarded header', () => {
    expect(resolvedAddress({ headers: {}, trustProxy: true })).toBe(remoteAddress);
  });
  test.each([true, false])('discards an incoming x-client-ip with trustProxy %s', (trustProxy) => {
    expect(resolvedAddress({ headers: { [CLIENT_ADDRESS_HEADER]: '9.9.9.9' }, trustProxy })).toBe(remoteAddress);
  });
  test('keeps the body readable', async () => {
    const original = new Request('http://localhost/x', { method: 'POST', body: '{"a":1}' });
    const request = withClientAddress({ request: original, remoteAddress, trustProxy: false, trustedProxyHops });
    expect(await request.text()).toBe('{"a":1}');
  });
});
