import { AppRoute } from '@superdoc-collab/types';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { impersonateUser } from '@/features/admin/admin-api';
import { stopImpersonating } from './impersonation-api';

function useSwitchIdentity(destination: AppRoute): () => Promise<void> {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return async function switchIdentity(): Promise<void> {
    await queryClient.resetQueries();
    await navigate(destination);
  };
}

export function useImpersonate(userId: string): UseMutationResult<void, Error, void> {
  const switchIdentity = useSwitchIdentity(AppRoute.Documents);
  return useMutation({ mutationFn: () => impersonateUser(userId), onSuccess: switchIdentity });
}

export function useStopImpersonating(): UseMutationResult<void, Error, void> {
  const switchIdentity = useSwitchIdentity(AppRoute.Admin);
  return useMutation({ mutationFn: stopImpersonating, onSuccess: switchIdentity });
}
