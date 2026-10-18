import { LogOut } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { SIGN_OUT_LABEL } from './auth-copy';
import { useSignOut } from './use-sign-out';

export function SignOutMenuItem() {
  const signOut = useSignOut();

  return (
    <DropdownMenuItem onSelect={signOut}>
      <LogOut aria-hidden />
      {SIGN_OUT_LABEL}
    </DropdownMenuItem>
  );
}
