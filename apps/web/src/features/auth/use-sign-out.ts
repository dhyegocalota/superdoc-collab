import { AppRoute } from '@superdoc-collab/types';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { authClient } from './auth-client';
import { SIGNED_OUT_STATE } from './sign-out-state';
import { SESSION_QUERY_KEY } from './use-session';

export function useSignOut(): () => Promise<void> {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async function signOut(): Promise<void> {
    await authClient.signOut();
    await navigate(AppRoute.SignIn, { replace: true, state: SIGNED_OUT_STATE });
    queryClient.setQueryData(SESSION_QUERY_KEY, null);
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  };
}
