import { zodResolver } from '@hookform/resolvers/zod';
import { AppRoute, signInSchema, type SignInInput } from '@superdoc-collab/types';
import { useForm } from 'react-hook-form';
import { useLocation } from 'react-router';
import { browserTimeZone } from '@/lib/browser-time-zone';
import { useDocumentTitle } from '@/lib/use-document-title';
import { AuthCard, type AuthCardLink } from './auth-card';
import { authClient } from './auth-client';
import {
  CLAIM_LINK_LABEL,
  EMAIL_FIELD_LABEL,
  NO_ACCOUNT_PROMPT,
  PASSWORD_FIELD_LABEL,
  SIGN_IN_DESCRIPTION,
  SIGN_IN_LABEL,
  SIGN_IN_PENDING_LABEL,
} from './auth-copy';
import { signedQuerySearch } from './signed-query-search';
import { AuthFieldType, AuthTextField } from './auth-text-field';
import { useAuthSubmit } from './use-auth-submit';
import { fetchMe } from './use-session';
import { useSetup } from './use-setup';

function claimLinkOf(search: string): AuthCardLink {
  return { prompt: NO_ACCOUNT_PROMPT, label: CLAIM_LINK_LABEL, to: `${AppRoute.SignUp}${signedQuerySearch(search)}` };
}

async function backfillTimeZone(): Promise<void> {
  const user = await fetchMe();
  if (!user) return;
  if (user.timeZone !== null) return;
  await authClient.updateUser({ timeZone: browserTimeZone() });
}

export function SignInPage() {
  const form = useForm<SignInInput>({ resolver: zodResolver(signInSchema), defaultValues: { email: '', password: '' } });
  const setup = useSetup();
  const submit = useAuthSubmit({
    form,
    request: (values, responseCapture) => authClient.signIn.email(values, responseCapture),
    afterSuccess: backfillTimeZone,
  });
  const { search } = useLocation();
  const isUnclaimed = setup.data?.claimed === false;
  useDocumentTitle(SIGN_IN_LABEL);

  return (
    <AuthCard
      form={form}
      onSubmit={submit}
      title={SIGN_IN_LABEL}
      description={SIGN_IN_DESCRIPTION}
      submitLabel={SIGN_IN_LABEL}
      pendingLabel={SIGN_IN_PENDING_LABEL}
      link={isUnclaimed ? claimLinkOf(search) : null}
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
