export const CLIENT_ADDRESS_HEADER = 'x-client-ip';
const FORWARDED_FOR_HEADER = 'x-forwarded-for';
const FORWARDED_SEPARATOR = ',';

// NB: production runs behind Traefik with TRUST_PROXY=true. Traefik overwrites X-Forwarded-For from untrusted sources by default, which is what makes trusting its first entry safe. Never set TRUST_PROXY=true when the app port is reachable without that proxy.
export function withClientAddress({ request, remoteAddress, trustProxy }: { request: Request; remoteAddress: string; trustProxy: boolean }): Request {
  const headers = new Headers(request.headers);
  const forwardedFor = headers.get(FORWARDED_FOR_HEADER);
  const forwardedAddress = forwardedFor?.split(FORWARDED_SEPARATOR).at(0)?.trim();
  headers.delete(CLIENT_ADDRESS_HEADER);
  headers.set(CLIENT_ADDRESS_HEADER, trustProxy && forwardedAddress ? forwardedAddress : remoteAddress);
  return new Request(request, { headers });
}
