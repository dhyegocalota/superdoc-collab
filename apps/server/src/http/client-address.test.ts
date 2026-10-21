import { describe, expect, test } from 'vitest';
import { addressWindowKeyOf, publicAddressKeyOf, CLIENT_ADDRESS_HEADER, withClientAddress } from './client-address';

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

describe('addressWindowKeyOf', () => {
  test('an IPv4 address keys as itself', () => {
    expect(addressWindowKeyOf('203.0.113.7')).toBe('203.0.113.7');
  });

  test('an IPv4-mapped IPv6 address keys as itself', () => {
    expect(addressWindowKeyOf('::ffff:203.0.113.7')).toBe('::ffff:203.0.113.7');
  });

  test('addresses of one IPv6 /64 share a key, however they are written', () => {
    const keys = ['2001:db8:abcd:12::1', '2001:0db8:abcd:0012:ffff:ffff:ffff:ffff', '2001:DB8:ABCD:12:1:2:3:4'].map(addressWindowKeyOf);
    expect(new Set(keys).size).toBe(1);
  });

  test('addresses of two IPv6 /64 networks do not share a key', () => {
    expect(addressWindowKeyOf('2001:db8:abcd:12::1')).not.toBe(addressWindowKeyOf('2001:db8:abcd:13::1'));
  });

  test('loopback and a zone id are keyed without panic', () => {
    expect(addressWindowKeyOf('::1')).toBe(addressWindowKeyOf('0:0:0:0:0:0:0:1'));
    expect(addressWindowKeyOf('fe80::1%en0')).toBe(addressWindowKeyOf('fe80::2'));
  });
});

describe('publicAddressKeyOf', () => {
  test('the trusted forwarded address is keyed by its /64', () => {
    const key = publicAddressKeyOf({
      forwardedFor: '198.51.100.1, 2001:db8:1:2:aaaa::1',
      remoteAddress: '10.0.0.1',
      trustProxy: true,
      trustedProxyHops: 1,
    });
    expect(key).toBe(addressWindowKeyOf('2001:db8:1:2::'));
  });

  test('the socket address is keyed when no proxy is trusted', () => {
    expect(publicAddressKeyOf({ forwardedFor: '198.51.100.1', remoteAddress: '203.0.113.9', trustProxy: false, trustedProxyHops: 1 })).toBe(
      '203.0.113.9',
    );
  });
});
