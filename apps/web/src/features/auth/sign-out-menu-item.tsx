import { LogOut } from 'lucide-react';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { getUnsyncedEditsSnapshot, requestLeave } from '@/features/editor/unsynced-edits-store';
import { SIGN_OUT_LABEL } from './auth-copy';
import { useSignOut } from './use-sign-out';

export function SignOutMenuItem() {
  const signOut = useSignOut();

  function handleSelect(): void {
    const { isUnsynced } = getUnsyncedEditsSnapshot();
    if (isUnsynced) return requestLeave(signOut);
    signOut();
  }

  return (
    <DropdownMenuItem onSelect={handleSelect}>
      <LogOut aria-hidden />
      {SIGN_OUT_LABEL}
    </DropdownMenuItem>
  );
}
