import { AppRoute } from '@superdoc-history/types';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { SessionSkeleton } from './session-skeleton';
import { useSession } from './use-session';

export function RedirectIfSession({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  if (isLoading) return <SessionSkeleton />;
  if (user) return <Navigate to={AppRoute.Documents} replace />;
  return children;
}
