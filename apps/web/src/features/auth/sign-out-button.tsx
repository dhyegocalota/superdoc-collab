import { AppRoute } from '@superdoc-history/types';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { authClient } from './auth-client';
import { SESSION_QUERY_KEY } from './use-session';

export function SignOutButton() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function signOut(): Promise<void> {
    await authClient.signOut();
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    await navigate(AppRoute.SignIn);
  }

  return (
    <Button variant="outline" onClick={signOut}>
      Sign out
    </Button>
  );
}
