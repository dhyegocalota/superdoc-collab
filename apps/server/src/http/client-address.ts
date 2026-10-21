export const CLIENT_ADDRESS_HEADER = 'x-client-ip';
export const FORWARDED_FOR_HEADER = 'x-forwarded-for';
const FORWARDED_SEPARATOR = ',';
export const UNKNOWN_CLIENT_ADDRESS_MESSAGE = 'Unknown client address';

export function clientAddressOf({
  forwardedFor,
  remoteAddress,
  trustProxy,
  trustedProxyHops,
}: {
  forwardedFor: string | string[] | null | undefined;
  remoteAddress: string;
  trustProxy: boolean;
  trustedProxyHops: number;
}): string {
  const forwardedAddress = forwardedFor?.toString().split(FORWARDED_SEPARATOR).at(-trustedProxyHops)?.trim();
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

const IPV6_GROUP_COUNT = 8;
const IPV6_PREFIX_GROUPS = 4;
const IPV6_COMPRESSION = '::';
const IPV6_SEPARATOR = ':';
const ZONE_SEPARATOR = '%';
const IPV4_MARKER = '.';
const LEADING_ZEROS = /^0+(?=.)/;
const IPV6_PREFIX_SUFFIX = '/64';

function groupsOf(part: string): string[] {
  return part.split(IPV6_SEPARATOR).filter((group) => group !== '');
}

export function addressWindowKeyOf(address: string): string {
  if (!address.includes(IPV6_SEPARATOR) || address.includes(IPV4_MARKER)) return address;
  const [unzoned = address] = address.split(ZONE_SEPARATOR);
  const [head = '', tail] = unzoned.split(IPV6_COMPRESSION);
  const headGroups = groupsOf(head);
  const tailGroups = tail === undefined ? [] : groupsOf(tail);
  const zeroGroups = Array.from({ length: IPV6_GROUP_COUNT - headGroups.length - tailGroups.length }, () => '0');
  const groups = tail === undefined ? headGroups : [...headGroups, ...zeroGroups, ...tailGroups];
  const prefix = groups.slice(0, IPV6_PREFIX_GROUPS).map((group) => group.toLowerCase().replace(LEADING_ZEROS, ''));
  return `${prefix.join(IPV6_SEPARATOR)}${IPV6_PREFIX_SUFFIX}`;
}
