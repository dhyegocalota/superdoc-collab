import { useQueryClient } from '@tanstack/react-query';
import type { FieldValues, UseFormReturn } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { authFailureMessage, AUTH_RETRY_AFTER_HEADER } from './auth-failure';
import { safeNextPath } from './safe-next-path';
import { SESSION_QUERY_KEY } from './use-session';

type ResponseCapture = { onResponse: (context: { response: Response }) => void };
type AuthRequestResult = { error: { status: number } | null };

export function useAuthSubmit<Values extends FieldValues>({
  form,
  request,
}: {
  form: UseFormReturn<Values>;
  request: (values: Values, responseCapture: ResponseCapture) => Promise<AuthRequestResult>;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  return async function submit(values: Values): Promise<void> {
    const captured: { retryAfterSeconds: string | null } = { retryAfterSeconds: null };
    const responseCapture: ResponseCapture = {
      onResponse: ({ response }) => {
        captured.retryAfterSeconds = response.headers.get(AUTH_RETRY_AFTER_HEADER);
      },
    };
    const { error } = await request(values, responseCapture);
    if (error) {
      form.setError('root', { message: authFailureMessage({ status: error.status, retryAfterSeconds: captured.retryAfterSeconds }) });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY, refetchType: 'all' });
    await navigate(safeNextPath(searchParams.get('next')));
  };
}
