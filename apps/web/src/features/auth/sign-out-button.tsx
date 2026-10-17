import { Button } from '@/components/ui/button';
import { SIGN_OUT_LABEL } from './auth-copy';
import { useSignOut } from './use-sign-out';

export function SignOutButton() {
  const signOut = useSignOut();

  return (
    <Button variant="outline" onClick={signOut}>
      {SIGN_OUT_LABEL}
    </Button>
  );
}
