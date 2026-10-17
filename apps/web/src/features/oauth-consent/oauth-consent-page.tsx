import { useMutation } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useDocumentTitle } from '@/lib/use-document-title';
import { submitConsent } from './oauth-consent-api';
import {
  APPROVE_LABEL,
  APPROVING_LABEL,
  CLIENT_LOADING_LABEL,
  CONSENT_HEADING,
  consentDescription,
  redirectNotice,
  appRedirectNotice,
  CLIENT_LOAD_ERROR_MESSAGE,
  DENY_LABEL,
  INCOMPLETE_REQUEST_MESSAGE,
  scopeLabel,
  SCOPES_HEADING,
} from './oauth-consent-copy';
import { useOAuthClientName } from './use-oauth-client-name';

const SCOPE_SEPARATOR = ' ';
type RedirectTarget = { name: string; notice: string };

function redirectTargetOf(redirectUri: string | null): RedirectTarget | null {
  if (!redirectUri) return null;
  try {
    const { host, protocol } = new URL(redirectUri);
    if (host) return { name: host, notice: redirectNotice(host) };
    const scheme = protocol.slice(0, -1);
    if (!scheme) return null;
    return { name: scheme, notice: appRedirectNotice(scheme) };
  } catch {
    return null;
  }
}

function clientDisplayName({ clientName, redirectName }: { clientName: string | null; redirectName: string }): string {
  if (clientName) return clientName;
  return redirectName;
}

function ConsentShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">{children}</Card>
    </main>
  );
}

function ConsentRequest({ clientId, scopes, redirectTarget }: { clientId: string; scopes: string[]; redirectTarget: RedirectTarget }) {
  const clientName = useOAuthClientName(clientId);
  const answer = useMutation({ mutationFn: submitConsent });
  const isAnswering = answer.isPending || answer.isSuccess;

  return (
    <ConsentShell>
      <CardHeader>
        <CardTitle>{CONSENT_HEADING}</CardTitle>
        {clientName.isSuccess && (
          <CardDescription>
            {consentDescription(clientDisplayName({ clientName: clientName.data, redirectName: redirectTarget.name }))}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {clientName.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            {CLIENT_LOADING_LABEL}
          </p>
        )}
        {clientName.isError && <ErrorMessage>{CLIENT_LOAD_ERROR_MESSAGE}</ErrorMessage>}
        {clientName.isSuccess && (
          <section aria-label={SCOPES_HEADING} className="space-y-2">
            <h2 className="text-sm font-medium">{SCOPES_HEADING}</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {scopes.map((scope) => (
                <li key={scope}>{scopeLabel(scope)}</li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">{redirectTarget.notice}</p>
          </section>
        )}
        {answer.isError && <ErrorMessage>{answer.error.message}</ErrorMessage>}
      </CardContent>
      {clientName.isSuccess && (
        <CardFooter className="gap-2">
          <Button className="flex-1" disabled={isAnswering} onClick={() => answer.mutate(true)}>
            {answer.isPending ? APPROVING_LABEL : APPROVE_LABEL}
          </Button>
          <Button variant="outline" className="flex-1" disabled={isAnswering} onClick={() => answer.mutate(false)}>
            {DENY_LABEL}
          </Button>
        </CardFooter>
      )}
    </ConsentShell>
  );
}

export function OAuthConsentPage() {
  const [searchParams] = useSearchParams();
  const clientId = searchParams.get('client_id');
  const requestedScope = searchParams.get('scope');
  const redirectTarget = redirectTargetOf(searchParams.get('redirect_uri'));
  useDocumentTitle(CONSENT_HEADING);

  if (!clientId || !requestedScope || !redirectTarget)
    return (
      <ConsentShell>
        <CardContent>
          <ErrorMessage>{INCOMPLETE_REQUEST_MESSAGE}</ErrorMessage>
        </CardContent>
      </ConsentShell>
    );
  return (
    <ConsentRequest clientId={clientId} scopes={requestedScope.split(SCOPE_SEPARATOR).filter(Boolean)} redirectTarget={redirectTarget} />
  );
}
