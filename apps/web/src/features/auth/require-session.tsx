import { AppRoute } from '@superdoc-history/types';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from './use-session';

export function RequireSession({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const location = useLocation();
  if (isLoading) return <div className="min-h-screen animate-pulse bg-muted" />;
  if (user) return children;
  const next = encodeURIComponent(location.pathname + location.search);
  return <Navigate to={`${AppRoute.SignIn}?next=${next}`} replace />;
}
