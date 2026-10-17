import type { ConnectionFailureReason, ConnectionState } from '@superdoc-collab/types';

type ConnectionBannerProps = { state: ConnectionState; failureReason: ConnectionFailureReason | null; onReload: () => void };

export function ConnectionBanner(_props: ConnectionBannerProps) {
  throw new Error('ConnectionBanner is not implemented');
}
