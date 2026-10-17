import { AppRoute } from '@superdoc-history/types';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/button';
import { authClient } from './auth-client';
import { SIGN_OUT_LABEL } from './auth-copy';
import { SIGNED_OUT_STATE } from './sign-out-state';

export function SignOutButton() {
  const navigate = useNavigate();

  async function signOut(): Promise<void> {
    await authClient.signOut();
    await navigate(AppRoute.SignIn, { replace: true, state: SIGNED_OUT_STATE });
  }

  return (
    <Button variant="outline" onClick={signOut}>
      {SIGN_OUT_LABEL}
    </Button>
  );
}
