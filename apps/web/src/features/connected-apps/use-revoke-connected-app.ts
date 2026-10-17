import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { CONNECTED_APPS_QUERY_KEY, revokeConnectedApp } from './connected-apps-api';

export function useRevokeConnectedApp(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeConnectedApp,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CONNECTED_APPS_QUERY_KEY }),
  });
}
