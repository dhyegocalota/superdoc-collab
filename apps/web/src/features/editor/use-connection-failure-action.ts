import { ConnectionFailureReason } from '@superdoc-collab/types';
import { useLocation, useNavigate } from 'react-router';
import { signInPathFor } from '@/features/auth/sign-in-path';
import { SIGNED_OUT_STATE } from '@/features/auth/sign-out-state';

export function useConnectionFailureAction({
  failureReason,
  reload,
}: {
  failureReason: ConnectionFailureReason | null;
  reload: () => void;
}): () => void {
  const navigate = useNavigate();
  const location = useLocation();

  function signInAgain(): void {
    navigate(signInPathFor(location), { state: SIGNED_OUT_STATE });
  }

  if (failureReason === ConnectionFailureReason.SessionEnded) return signInAgain;
  return reload;
}
