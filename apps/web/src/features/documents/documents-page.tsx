import { AppTopBar } from '@/components/app-top-bar';
import { ErrorMessage } from '@/components/error-message';
import { AccountMenu } from '@/features/account/account-menu';
import { UseWithAiDialog } from '@/features/connected-apps/use-with-ai-dialog';
import { useDocumentTitle } from '@/lib/use-document-title';
import type { DocumentSummary } from '@superdoc-collab/types';
import type { ComponentType } from 'react';
import { DocumentListKind } from './document-columns';
import { DocumentListSkeleton } from './document-list-skeleton';
import { DocumentCards } from './document-cards';
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
import { DocumentsEmptyState } from './documents-empty-state';
import { DocumentsViewToggle } from './documents-view-toggle';
import { NewDocumentButton } from './new-document-button';
import { UploadDialog } from './upload-dialog';
import { UploadDropOverlay } from './upload-drop-overlay';
import { useCreateDocument } from './use-create-document';
import { useDocuments } from './use-documents';
import { DocumentsView, useDocumentsView } from './use-documents-view';
import { UploadMessage } from './upload-message';
import { useUploadDocument } from './use-upload-document';

type DocumentListProps = { documents: DocumentSummary[]; emptyMessage: string; kind: DocumentListKind };

const LIST_BY_VIEW: Record<DocumentsView, ComponentType<DocumentListProps>> = {
  [DocumentsView.Cards]: DocumentCards,
  [DocumentsView.Table]: DocumentTable,
};

const MAIN_WIDTH_CLASS_BY_VIEW: Record<DocumentsView, string> = {
  [DocumentsView.Cards]: 'max-w-6xl',
  [DocumentsView.Table]: 'max-w-4xl',
};

export function DocumentsPage() {
  const { data, isError, isPending } = useDocuments();
  const createDocument = useCreateDocument();
  const upload = useUploadDocument();
  const { view, chooseView } = useDocumentsView();
  const DocumentList = LIST_BY_VIEW[view];
  const hasNoDocuments = data !== undefined && data.mine.length === 0 && data.shared.length === 0;
  useDocumentTitle(DOCUMENTS_HEADING);

  return (
    <div className="min-h-full">
      <AppTopBar
        right={
          <>
            <UseWithAiDialog title={null} canEdit={false} />
            <AccountMenu colorSlot={null} />
          </>
        }
      />
      <main className={`mx-auto space-y-8 p-6 ${MAIN_WIDTH_CLASS_BY_VIEW[view]}`}>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold">{DOCUMENTS_HEADING}</h1>
          {data && !hasNoDocuments && <DocumentsViewToggle view={view} onChange={chooseView} />}
        </div>
        {isError && <ErrorMessage>{DOCUMENTS_LOAD_ERROR_MESSAGE}</ErrorMessage>}
        {isPending && <DocumentListSkeleton />}
        {data && <UploadDropOverlay onFiles={upload.uploadFiles} />}
        {createDocument.isError && <ErrorMessage>{CREATE_ERROR_MESSAGE}</ErrorMessage>}
        {hasNoDocuments && (
          <DocumentsEmptyState isCreating={createDocument.isPending} onCreate={() => createDocument.mutate()} upload={upload} />
        )}
        {data && !hasNoDocuments && (
          <>
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold">{MINE_HEADING}</h2>
                <div className="flex gap-2">
                  <UploadDialog />
                  <NewDocumentButton isPending={createDocument.isPending} onCreate={() => createDocument.mutate()} />
                </div>
              </div>
              <UploadMessage upload={upload} />
              <DocumentList documents={data.mine} emptyMessage={MINE_EMPTY_MESSAGE} kind={DocumentListKind.Mine} />
            </section>
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">{SHARED_HEADING}</h2>
              <DocumentList documents={data.shared} emptyMessage={SHARED_EMPTY_MESSAGE} kind={DocumentListKind.Shared} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
