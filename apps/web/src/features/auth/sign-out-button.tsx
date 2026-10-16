import { AppRoute } from '@superdoc-history/types';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { authClient } from './auth-client';
import { SIGN_OUT_LABEL } from './auth-copy';
import { SESSION_QUERY_KEY } from './use-session';

export function SignOutButton() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function signOut(): Promise<void> {
    await authClient.signOut();
    await navigate(AppRoute.SignIn, { replace: true });
    queryClient.setQueryData(SESSION_QUERY_KEY, null);
  }

  return (
    <Button variant="outline" onClick={signOut}>
      {SIGN_OUT_LABEL}
    </Button>
  );
}
