import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { SessionSkeleton } from './session-skeleton';
import { signInPathFor } from './sign-in-path';
import { useSession } from './use-session';

export function RequireSession({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const location = useLocation();
  if (isLoading) return <SessionSkeleton />;
  if (user) return children;
  return <Navigate to={signInPathFor(location)} replace />;
}
