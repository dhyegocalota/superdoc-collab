export const CLIENT_ADDRESS_HEADER = 'x-client-ip';
const FORWARDED_FOR_HEADER = 'x-forwarded-for';
const FORWARDED_SEPARATOR = ',';

export function withClientAddress({ request, remoteAddress, trustProxy }: { request: Request; remoteAddress: string; trustProxy: boolean }): Request {
  const headers = new Headers(request.headers);
  const forwardedFor = headers.get(FORWARDED_FOR_HEADER);
  const forwardedAddress = forwardedFor?.split(FORWARDED_SEPARATOR).at(0)?.trim();
  headers.delete(CLIENT_ADDRESS_HEADER);
  headers.set(CLIENT_ADDRESS_HEADER, trustProxy && forwardedAddress ? forwardedAddress : remoteAddress);
  return new Request(request, { headers });
}
