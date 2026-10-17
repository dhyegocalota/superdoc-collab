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
  CLIENT_LOAD_ERROR_MESSAGE,
  CLIENT_LOADING_LABEL,
  CONSENT_FAILED_MESSAGE,
  CONSENT_HEADING,
  consentDescription,
  DENY_LABEL,
  INCOMPLETE_REQUEST_MESSAGE,
  scopeLabel,
  SCOPES_HEADING,
} from './oauth-consent-copy';
import { useOAuthClientName } from './use-oauth-client-name';

const SCOPE_SEPARATOR = ' ';
function ConsentShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">{children}</Card>
    </main>
  );
}

function ConsentRequest({ clientId, scopes }: { clientId: string; scopes: string[] }) {
  const clientName = useOAuthClientName(clientId);
  const answer = useMutation({ mutationFn: submitConsent });
  const isAnswering = answer.isPending || answer.isSuccess;

  return (
    <ConsentShell>
      <CardHeader>
        <CardTitle>{CONSENT_HEADING}</CardTitle>
        {clientName.data && <CardDescription>{consentDescription(clientName.data)}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {clientName.isPending && (
          <p role="status" className="text-sm text-muted-foreground">
            {CLIENT_LOADING_LABEL}
          </p>
        )}
        {clientName.isError && <ErrorMessage>{CLIENT_LOAD_ERROR_MESSAGE}</ErrorMessage>}
        {clientName.data && (
          <section aria-label={SCOPES_HEADING} className="space-y-2">
            <h2 className="text-sm font-medium">{SCOPES_HEADING}</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {scopes.map((scope) => (
                <li key={scope}>{scopeLabel(scope)}</li>
              ))}
            </ul>
          </section>
        )}
        {answer.isError && <ErrorMessage>{CONSENT_FAILED_MESSAGE}</ErrorMessage>}
      </CardContent>
      {clientName.data && (
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
  useDocumentTitle(CONSENT_HEADING);

  if (!clientId || !requestedScope)
    return (
      <ConsentShell>
        <CardContent>
          <ErrorMessage>{INCOMPLETE_REQUEST_MESSAGE}</ErrorMessage>
        </CardContent>
      </ConsentShell>
    );
  return <ConsentRequest clientId={clientId} scopes={requestedScope.split(SCOPE_SEPARATOR).filter(Boolean)} />;
}
