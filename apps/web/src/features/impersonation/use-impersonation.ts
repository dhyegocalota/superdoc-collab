import { AppRoute } from '@superdoc-collab/types';
import { useMutation, useQueryClient, type Query, type UseMutationResult } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { ADMIN_QUERY_KEY, impersonateUser } from '@/features/admin/admin-api';
import { allowLeave } from '@/features/editor/unsynced-edits-store';
import { SESSION_QUERY_KEY } from '@/features/auth/use-session';
import { stopImpersonating } from './impersonation-api';

function isOutsideSession(query: Query): boolean {
  return query.queryKey[0] !== SESSION_QUERY_KEY[0];
}

function isOutsideAdmin(query: Query): boolean {
  return query.queryKey[0] !== ADMIN_QUERY_KEY[0];
}

function useImpersonationChange(destination: AppRoute): () => Promise<void> {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async function enter(): Promise<void> {
    await queryClient.cancelQueries({ queryKey: ADMIN_QUERY_KEY });
    queryClient.removeQueries({ queryKey: ADMIN_QUERY_KEY });
    await queryClient.resetQueries({ predicate: isOutsideAdmin });
    await navigate(destination);
  };
}

function useImpersonationEnd(destination: AppRoute): () => Promise<void> {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async function end(): Promise<void> {
    await queryClient.cancelQueries({ predicate: isOutsideSession });
    queryClient.removeQueries({ predicate: isOutsideSession });
    allowLeave();
    await navigate(AppRoute.Documents, { replace: true });
    await queryClient.resetQueries();
    await navigate(destination, { replace: true });
  };
}

export function useImpersonate(userId: string): UseMutationResult<void, Error, void> {
  const enter = useImpersonationChange(AppRoute.Documents);
  return useMutation({ mutationFn: () => impersonateUser(userId), onSuccess: enter });
}

export function useStopImpersonating(): UseMutationResult<void, Error, void> {
  const end = useImpersonationEnd(AppRoute.Admin);
  return useMutation({ mutationFn: stopImpersonating, onSuccess: end });
}
