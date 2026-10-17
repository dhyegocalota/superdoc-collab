import { zodResolver } from '@hookform/resolvers/zod';
import { AppRoute, signInSchema, type SignInInput } from '@superdoc-history/types';
import { useForm } from 'react-hook-form';
import { useDocumentTitle } from '@/lib/use-document-title';
import { AuthCard } from './auth-card';
import { authClient } from './auth-client';
import {
  EMAIL_FIELD_LABEL,
  NO_ACCOUNT_PROMPT,
  PASSWORD_FIELD_LABEL,
  SIGN_IN_DESCRIPTION,
  SIGN_IN_LABEL,
  SIGN_IN_PENDING_LABEL,
  SIGN_UP_LABEL,
} from './auth-copy';
import { AuthFieldType, AuthTextField } from './auth-text-field';
import { useAuthSubmit } from './use-auth-submit';

export function SignInPage() {
  const form = useForm<SignInInput>({ resolver: zodResolver(signInSchema), defaultValues: { email: '', password: '' } });
  const submit = useAuthSubmit({
    form,
    request: (values, responseCapture) => authClient.signIn.email(values, responseCapture),
  });
  useDocumentTitle(SIGN_IN_LABEL);

  return (
    <AuthCard
      form={form}
      onSubmit={submit}
      title={SIGN_IN_LABEL}
      description={SIGN_IN_DESCRIPTION}
      submitLabel={SIGN_IN_LABEL}
      pendingLabel={SIGN_IN_PENDING_LABEL}
      prompt={NO_ACCOUNT_PROMPT}
      linkLabel={SIGN_UP_LABEL}
      linkTo={AppRoute.SignUp}
    >
      <AuthTextField control={form.control} name="email" label={EMAIL_FIELD_LABEL} type={AuthFieldType.Email} autoComplete="email" />
      <AuthTextField
        control={form.control}
        name="password"
        label={PASSWORD_FIELD_LABEL}
        type={AuthFieldType.Password}
        autoComplete="current-password"
      />
    </AuthCard>
  );
}
