import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authClient } from '@/features/auth/auth-client';
import { SESSION_QUERY_KEY } from '@/features/auth/use-session';
import { SAVE_TIME_ZONE_FAILED_MESSAGE, TIME_ZONE_SAVED_TOAST } from './settings-copy';

export function useSaveTimeZone(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (timeZone: string) => {
      const { error } = await authClient.updateUser({ timeZone });
      if (error) throw new Error(SAVE_TIME_ZONE_FAILED_MESSAGE);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      toast(TIME_ZONE_SAVED_TOAST);
    },
  });
}
