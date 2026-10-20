import { ConnectionFailureReason } from '@superdoc-collab/types';

export function useHeavyRoomsRetry({ failureReason, reload }: { failureReason: ConnectionFailureReason | null; reload: () => void }): void {
  void [failureReason, reload];
}
