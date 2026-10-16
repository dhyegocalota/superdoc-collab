import { AppRoute } from '@superdoc-history/types';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { SessionSkeleton } from './session-skeleton';
import { useSession } from './use-session';

export function RequireSession({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const location = useLocation();
  if (isLoading) return <SessionSkeleton />;
  if (user) return children;
  const next = encodeURIComponent(location.pathname + location.search);
  return <Navigate to={`${AppRoute.SignIn}?next=${next}`} replace />;
}
