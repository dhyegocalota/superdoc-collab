import { AppRoute } from '@superdoc-history/types';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { scopeLabel } from '@/features/oauth-consent/oauth-consent-copy';
import { formatTimestamp } from '@/lib/format-date-time';
import { useDocumentTitle } from '@/lib/use-document-title';
import type { ConnectedApp } from './connected-apps-api';
import {
  BACK_TO_DOCUMENTS_LABEL,
  CONNECTED_APPS_EMPTY_MESSAGE,
  CONNECTED_APPS_HEADING,
  CONNECTED_APPS_LOAD_ERROR_MESSAGE,
  CONNECTED_ON_LABEL,
  LOADING_CONNECTED_APPS_LABEL,
  REVOKE_LABEL,
  revokeLabel,
} from './connected-apps-copy';
import { ConnectSnippets } from './connect-snippets';
import { useConnectedApps } from './use-connected-apps';
import { useRevokeConnectedApp } from './use-revoke-connected-app';

const SKELETON_ROWS = 2;

function ConnectedAppRow({ app }: { app: ConnectedApp }) {
  const revoke = useRevokeConnectedApp();

  return (
    <li className="flex flex-wrap items-start justify-between gap-4 rounded-md border p-4">
      <div className="space-y-2">
        <p className="font-medium">{app.clientName}</p>
        <p className="text-sm text-muted-foreground">
          {CONNECTED_ON_LABEL} {formatTimestamp(app.connectedAt)}
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {app.scopes.map((scope) => (
            <li key={scope}>{scopeLabel(scope)}</li>
          ))}
        </ul>
      </div>
      <Button variant="outline" aria-label={revokeLabel(app.clientName)} disabled={revoke.isPending} onClick={() => revoke.mutate(app.id)}>
        {REVOKE_LABEL}
      </Button>
      {revoke.isError && <ErrorMessage className="w-full">{revoke.error.message}</ErrorMessage>}
    </li>
  );
}

function ConnectedAppsList({ apps }: { apps: ConnectedApp[] }) {
  if (apps.length === 0) return <p className="text-sm text-muted-foreground">{CONNECTED_APPS_EMPTY_MESSAGE}</p>;
  return (
    <ul className="space-y-2">
      {apps.map((app) => (
        <ConnectedAppRow key={app.id} app={app} />
      ))}
    </ul>
  );
}

export function ConnectedAppsPage() {
  const { data, isError, isPending } = useConnectedApps();
  useDocumentTitle(CONNECTED_APPS_HEADING);

  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-4 border-b px-6 py-4">
        <Button asChild variant="ghost" size="sm">
          <Link to={AppRoute.Documents}>
            <ArrowLeft />
            {BACK_TO_DOCUMENTS_LABEL}
          </Link>
        </Button>
      </header>
      <main className="mx-auto max-w-4xl space-y-8 p-6">
        <h1 className="text-2xl font-semibold">{CONNECTED_APPS_HEADING}</h1>
        {isError && <ErrorMessage>{CONNECTED_APPS_LOAD_ERROR_MESSAGE}</ErrorMessage>}
        {isPending && (
          <div role="status" aria-label={LOADING_CONNECTED_APPS_LABEL} className="space-y-2">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        )}
        {data && <ConnectedAppsList apps={data} />}
        <ConnectSnippets />
      </main>
    </div>
  );
}
