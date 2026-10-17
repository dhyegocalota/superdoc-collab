import { zodResolver } from '@hookform/resolvers/zod';
import { AppRoute, signUpSchema, type SignUpInput } from '@superdoc-history/types';
import { useForm } from 'react-hook-form';
import { useDocumentTitle } from '@/lib/use-document-title';
import { AuthCard } from './auth-card';
import { authClient } from './auth-client';
import {
  EMAIL_FIELD_LABEL,
  HAVE_ACCOUNT_PROMPT,
  NAME_FIELD_LABEL,
  PASSWORD_FIELD_LABEL,
  SIGN_IN_LABEL,
  SIGN_UP_DESCRIPTION,
  SIGN_UP_HEADING,
  SIGN_UP_LABEL,
  SIGN_UP_PENDING_LABEL,
} from './auth-copy';
import { AuthFieldType, AuthTextField } from './auth-text-field';
import { useAuthSubmit } from './use-auth-submit';

export function SignUpPage() {
  const form = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema), defaultValues: { name: '', email: '', password: '' } });
  const submit = useAuthSubmit({
    form,
    request: (values, responseCapture) => authClient.signUp.email(values, responseCapture),
  });
  useDocumentTitle(SIGN_UP_HEADING);

  return (
    <AuthCard
      form={form}
      onSubmit={submit}
      title={SIGN_UP_HEADING}
      description={SIGN_UP_DESCRIPTION}
      submitLabel={SIGN_UP_LABEL}
      pendingLabel={SIGN_UP_PENDING_LABEL}
      prompt={HAVE_ACCOUNT_PROMPT}
      linkLabel={SIGN_IN_LABEL}
      linkTo={AppRoute.SignIn}
    >
      <AuthTextField control={form.control} name="name" label={NAME_FIELD_LABEL} type={AuthFieldType.Text} autoComplete="name" />
      <AuthTextField control={form.control} name="email" label={EMAIL_FIELD_LABEL} type={AuthFieldType.Email} autoComplete="email" />
      <AuthTextField
        control={form.control}
        name="password"
        label={PASSWORD_FIELD_LABEL}
        type={AuthFieldType.Password}
        autoComplete="new-password"
      />
    </AuthCard>
  );
}
