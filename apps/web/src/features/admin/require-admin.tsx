import { AppRoute, UserRole } from '@superdoc-collab/types';
import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { toast } from 'sonner';
import { SessionSkeleton } from '@/features/auth/session-skeleton';
import { useSession } from '@/features/auth/use-session';
import { ADMINS_ONLY_TOAST } from './admin-copy';

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const location = useLocation();
  const isUserNotAdmin = user !== null && user.role !== UserRole.Admin;

  useEffect(() => {
    if (isUserNotAdmin) toast(ADMINS_ONLY_TOAST);
  }, [isUserNotAdmin]);

  if (isLoading) return <SessionSkeleton />;
  if (!user) return <Navigate to={`${AppRoute.SignIn}?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (isUserNotAdmin) return <Navigate to={AppRoute.Documents} replace />;
  return children;
}
