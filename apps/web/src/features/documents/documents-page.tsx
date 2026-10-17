import { SignOutButton } from '@/features/auth/sign-out-button';
import { useSession } from '@/features/auth/use-session';
import { DocumentTable } from './document-table';
import { DOCUMENTS_LOAD_ERROR_MESSAGE, MINE_EMPTY_MESSAGE, MINE_HEADING, SHARED_EMPTY_MESSAGE, SHARED_HEADING } from './documents-copy';
import { NewDocumentButton } from './new-document-button';
import { UploadDialog } from './upload-dialog';
import { useDocuments } from './use-documents';

export function DocumentsPage() {
  const { user } = useSession();
  const { data, isError } = useDocuments();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="font-medium">{user?.name}</span>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-4xl space-y-8 p-6">
        {isError && (
          <p role="alert" className="text-sm text-destructive">
            {DOCUMENTS_LOAD_ERROR_MESSAGE}
          </p>
        )}
        {data && (
          <>
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{MINE_HEADING}</h2>
                <div className="flex gap-2">
                  <UploadDialog />
                  <NewDocumentButton />
                </div>
              </div>
              <DocumentTable documents={data.mine} emptyMessage={MINE_EMPTY_MESSAGE} />
            </section>
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">{SHARED_HEADING}</h2>
              <DocumentTable documents={data.shared} emptyMessage={SHARED_EMPTY_MESSAGE} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
