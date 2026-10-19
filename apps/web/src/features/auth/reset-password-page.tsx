import { zodResolver } from '@hookform/resolvers/zod';
import {
  AppRoute,
  HttpStatus,
  PASSWORD_RESET_DONE_MESSAGE,
  PASSWORD_RESET_INVALID_MESSAGE,
  PASSWORD_RESET_QUERY_PARAMETER,
  signInSchema,
  type SignInInput,
} from '@superdoc-collab/types';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { useDocumentTitle } from '@/lib/use-document-title';
import { AuthCard } from './auth-card';
import { authClient } from './auth-client';
import {
  NEW_PASSWORD_FIELD_LABEL,
  RESET_PASSWORD_DESCRIPTION,
  RESET_PASSWORD_HEADING,
  RESET_PASSWORD_LABEL,
  RESET_PASSWORD_PENDING_LABEL,
} from './auth-copy';
import { authFailureMessage } from './auth-failure';
import { AuthFieldType, AuthTextField } from './auth-text-field';
import { LinkInvalidCard } from './link-invalid-card';
import { SESSION_QUERY_KEY } from './use-session';

const resetPasswordSchema = signInSchema.pick({ password: true });
type ResetPasswordInput = Pick<SignInInput, 'password'>;

function ResetPasswordCard({ token, onInvalidToken }: { token: string; onInvalidToken: () => void }) {
  const form = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema), defaultValues: { password: '' } });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  async function submit({ password }: ResetPasswordInput): Promise<void> {
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error?.status === HttpStatus.BadRequest) {
      onInvalidToken();
      return;
    }
    if (error) {
      form.setError('root', {
        message: authFailureMessage({ status: error.status, retryAfterSeconds: null, serverMessage: error.message }),
      });
      return;
    }
    toast(PASSWORD_RESET_DONE_MESSAGE);
    await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY, refetchType: 'all' });
    await navigate(AppRoute.SignIn);
  }

  return (
    <AuthCard
      form={form}
      onSubmit={submit}
      title={RESET_PASSWORD_HEADING}
      description={RESET_PASSWORD_DESCRIPTION}
      submitLabel={RESET_PASSWORD_LABEL}
      pendingLabel={RESET_PASSWORD_PENDING_LABEL}
      link={null}
    >
      <AuthTextField
        control={form.control}
        name="password"
        label={NEW_PASSWORD_FIELD_LABEL}
        type={AuthFieldType.Password}
        autoComplete="new-password"
      />
    </AuthCard>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get(PASSWORD_RESET_QUERY_PARAMETER);
  const [isTokenRejected, setIsTokenRejected] = useState(false);
  useDocumentTitle(RESET_PASSWORD_HEADING);

  if (token === null || isTokenRejected) return <LinkInvalidCard message={PASSWORD_RESET_INVALID_MESSAGE} />;
  return <ResetPasswordCard token={token} onInvalidToken={() => setIsTokenRejected(true)} />;
}
