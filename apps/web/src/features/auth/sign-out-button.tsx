import { AppRoute } from '@superdoc-collab/types';
import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
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
    <DropdownMenuItem onSelect={signOut}>
      <LogOut aria-hidden />
      {SIGN_OUT_LABEL}
    </DropdownMenuItem>
  );
}
