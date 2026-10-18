import { AppRoute } from '@superdoc-collab/types';
import { FileText } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { HOME_LINK_LABEL } from '@/features/editor/editor-copy';
import { APP_NAME } from '@/lib/app-copy';

export function BrandLink() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={AppRoute.Documents} aria-label={HOME_LINK_LABEL}>
        <span className="flex size-6 items-center justify-center rounded-sm bg-primary text-primary-foreground">
          <FileText aria-hidden className="size-3.5" />
        </span>
        <span className="hidden font-semibold sm:inline">{APP_NAME}</span>
      </Link>
    </Button>
  );
}
