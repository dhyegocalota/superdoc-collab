import { AppRoute } from '@superdoc-collab/types';
import { Link } from 'react-router';
import { BACK_TO_DOCUMENTS_LABEL } from './editor-copy';

export function UnavailableNotice({ message }: { message: string }) {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-4 p-6">
      <p role="alert">{message}</p>
      <Link to={AppRoute.Documents} className="underline">
        {BACK_TO_DOCUMENTS_LABEL}
      </Link>
    </main>
  );
}
