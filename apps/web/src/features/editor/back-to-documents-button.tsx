import { AppRoute } from '@superdoc-collab/types';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { BACK_TO_DOCUMENTS_LABEL } from './editor-copy';

export function BackToDocumentsButton() {
  return (
    <Button asChild variant="outline">
      <Link to={AppRoute.Documents}>{BACK_TO_DOCUMENTS_LABEL}</Link>
    </Button>
  );
}
