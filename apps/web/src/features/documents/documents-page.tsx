import { AppRoute, UserRole } from '@superdoc-collab/types';
import { Link } from 'react-router';
import { ADMIN_LINK_LABEL } from '@/features/admin/admin-copy';
import { CONNECTED_APPS_HEADING } from '@/features/connected-apps/connected-apps-copy';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { useSession } from '@/features/auth/use-session';
import { APP_NAME } from '@/lib/app-copy';
import { useDocumentTitle } from '@/lib/use-document-title';
import { ErrorMessage } from '@/components/error-message';
import { DocumentListKind } from './document-columns';
import { DocumentListSkeleton } from './document-list-skeleton';
import { DocumentTable } from './document-table';
import {
  CREATE_ERROR_MESSAGE,
  DOCUMENTS_HEADING,
  DOCUMENTS_LOAD_ERROR_MESSAGE,
  MINE_EMPTY_MESSAGE,
  MINE_HEADING,
  SHARED_EMPTY_MESSAGE,
  SHARED_HEADING,
} from './documents-copy';
import { NewDocumentButton } from './new-document-button';
import { UploadDialog } from './upload-dialog';
import { useCreateDocument } from './use-create-document';
import { useDocuments } from './use-documents';

export function DocumentsPage() {
  const { user } = useSession();
  const { data, isError, isPending } = useDocuments();
  const createDocument = useCreateDocument();
  useDocumentTitle(DOCUMENTS_HEADING);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <span className="font-semibold">{APP_NAME}</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{user?.name}</span>
          <Link to={AppRoute.ConnectedApps} className="text-sm underline-offset-4 hover:underline">
            {CONNECTED_APPS_HEADING}
          </Link>
          {user?.role === UserRole.Admin && (
            <Link to={AppRoute.Admin} className="text-sm hover:underline">
              {ADMIN_LINK_LABEL}
            </Link>
          )}
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-8 p-6">
        <h1 className="text-2xl font-semibold">{DOCUMENTS_HEADING}</h1>
        {isError && <ErrorMessage>{DOCUMENTS_LOAD_ERROR_MESSAGE}</ErrorMessage>}
        {isPending && <DocumentListSkeleton />}
        {data && (
          <>
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{MINE_HEADING}</h2>
                <div className="flex gap-2">
                  <UploadDialog />
                  <NewDocumentButton isPending={createDocument.isPending} onCreate={() => createDocument.mutate()} />
                </div>
              </div>
              {createDocument.isError && <ErrorMessage>{CREATE_ERROR_MESSAGE}</ErrorMessage>}
              <DocumentTable documents={data.mine} emptyMessage={MINE_EMPTY_MESSAGE} kind={DocumentListKind.Mine} />
            </section>
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">{SHARED_HEADING}</h2>
              <DocumentTable documents={data.shared} emptyMessage={SHARED_EMPTY_MESSAGE} kind={DocumentListKind.Shared} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
