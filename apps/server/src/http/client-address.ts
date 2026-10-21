export const CLIENT_ADDRESS_HEADER = 'x-client-ip';
const FORWARDED_FOR_HEADER = 'x-forwarded-for';
const FORWARDED_SEPARATOR = ',';
export const UNKNOWN_CLIENT_ADDRESS_MESSAGE = 'Unknown client address';

export function clientAddressOf({
  forwardedFor,
  remoteAddress,
  trustProxy,
  trustedProxyHops,
}: {
  forwardedFor: string | null | undefined;
  remoteAddress: string;
  trustProxy: boolean;
  trustedProxyHops: number;
}): string {
  const forwardedAddress = forwardedFor?.split(FORWARDED_SEPARATOR).at(-trustedProxyHops)?.trim();
  return trustProxy && forwardedAddress ? forwardedAddress : remoteAddress;
}

// NB ADR 0042: the client address is the entry the trusted proxy added, counted from the right by TRUSTED_PROXY_HOPS; entries to its left are client-chosen and never read. Never set TRUST_PROXY=true when the app port is reachable without that proxy.
export function withClientAddress({
  request,
  remoteAddress,
  trustProxy,
  trustedProxyHops,
}: {
  request: Request;
  remoteAddress: string;
  trustProxy: boolean;
  trustedProxyHops: number;
}): Request {
  const headers = new Headers(request.headers);
  const forwardedFor = headers.get(FORWARDED_FOR_HEADER);
  headers.delete(CLIENT_ADDRESS_HEADER);
  headers.set(CLIENT_ADDRESS_HEADER, clientAddressOf({ forwardedFor, remoteAddress, trustProxy, trustedProxyHops }));
  return new Request(request, { headers });
}
