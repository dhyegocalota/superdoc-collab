import { zodResolver } from '@hookform/resolvers/zod';
import { AppRoute, INVITE_QUERY_PARAMETER, INVITE_TOKEN_HEADER, signUpSchema, type SignUpInput } from '@superdoc-collab/types';
import { useForm } from 'react-hook-form';
import { useLocation, useSearchParams } from 'react-router';
import { ErrorMessage } from '@/components/error-message';
import { browserTimeZone } from '@/lib/browser-time-zone';
import { useDocumentTitle } from '@/lib/use-document-title';
import { AuthCard, type AuthCardLink } from './auth-card';
import { authClient } from './auth-client';
import {
  CLAIM_DESCRIPTION,
  CLAIM_TITLE,
  EMAIL_FIELD_LABEL,
  HAVE_ACCOUNT_PROMPT,
  INVITE_INVALID_MESSAGE,
  INVITED_DESCRIPTION,
  INVITED_TITLE,
  NAME_FIELD_LABEL,
  PASSWORD_FIELD_LABEL,
  SIGN_IN_LABEL,
  SIGN_UP_HEADING,
  SIGN_UP_LABEL,
  SIGN_UP_PENDING_LABEL,
  SETUP_FAILED_MESSAGE,
} from './auth-copy';
import { signedQuerySearch } from './signed-query-search';
import { AuthFieldType, AuthTextField } from './auth-text-field';
import { SessionSkeleton } from './session-skeleton';
import { useAuthSubmit } from './use-auth-submit';
import { useInvite } from './use-invite';
import { useSetup } from './use-setup';
import { InviteInvalidCard } from './invite-invalid-card';

function signInLinkOf(search: string): AuthCardLink {
  return { prompt: HAVE_ACCOUNT_PROMPT, label: SIGN_IN_LABEL, to: `${AppRoute.SignIn}${signedQuerySearch(search)}` };
}
const signUpFormSchema = signUpSchema.omit({ timeZone: true });
type SignUpFormInput = Omit<SignUpInput, 'timeZone'>;

function SignUpCard({ title, description, token }: { title: string; description: string; token: string | null }) {
  const form = useForm<SignUpFormInput>({ resolver: zodResolver(signUpFormSchema), defaultValues: { name: '', email: '', password: '' } });
  const submit = useAuthSubmit({
    form,
    request: (values, responseCapture) => authClient.signUp.email({ ...values, timeZone: browserTimeZone() }, responseCapture),
    headers: token === null ? undefined : { [INVITE_TOKEN_HEADER]: token },
  });
  const { search } = useLocation();

  return (
    <AuthCard
      form={form}
      onSubmit={submit}
      title={title}
      description={description}
      submitLabel={SIGN_UP_LABEL}
      pendingLabel={SIGN_UP_PENDING_LABEL}
      link={signInLinkOf(search)}
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

export function SignUpPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get(INVITE_QUERY_PARAMETER);
  const setup = useSetup();
  const invite = useInvite(token);
  useDocumentTitle(SIGN_UP_HEADING);

  if (setup.isError) return <ErrorMessage className="p-4">{SETUP_FAILED_MESSAGE}</ErrorMessage>;
  if (!setup.data) return <SessionSkeleton />;
  if (!setup.data.claimed) return <SignUpCard title={CLAIM_TITLE} description={CLAIM_DESCRIPTION} token={null} />;
  if (token === null) return <InviteInvalidCard />;
  if (invite.isPending) return <SessionSkeleton />;
  if (invite.isError) return <InviteInvalidCard />;
  return <SignUpCard title={INVITED_TITLE} description={INVITED_DESCRIPTION} token={token} />;
}
