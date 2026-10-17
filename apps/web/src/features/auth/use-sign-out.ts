import { AppRoute } from '@superdoc-collab/types';
import { useNavigate } from 'react-router';
import { authClient } from './auth-client';
import { SIGNED_OUT_STATE } from './sign-out-state';

export function useSignOut(): () => Promise<void> {
  const navigate = useNavigate();

  return async function signOut(): Promise<void> {
    await authClient.signOut();
    await navigate(AppRoute.SignIn, { replace: true, state: SIGNED_OUT_STATE });
  };
}
