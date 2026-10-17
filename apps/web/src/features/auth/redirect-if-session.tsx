import { useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { safeNextPath } from './safe-next-path';
import { SessionSkeleton } from './session-skeleton';
import { isSignedOutState } from './sign-out-state';
import { SESSION_QUERY_KEY, useSession } from './use-session';

export function RedirectIfSession({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const isSigningOut = isSignedOutState(location.state);

  useEffect(() => {
    if (!isSigningOut) return;
    queryClient.setQueryData(SESSION_QUERY_KEY, null);
    navigate(location.pathname, { replace: true, state: null });
  }, [isSigningOut, queryClient, navigate, location.pathname]);

  if (isSigningOut) return children;
  if (isLoading) return <SessionSkeleton />;
  if (user) return <Navigate to={safeNextPath(searchParams.get('next'))} replace />;
  return children;
}
