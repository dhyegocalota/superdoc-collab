import { AppRoute } from '@superdoc-collab/types';
import { Link } from 'react-router';
import { AppMark } from '@/components/app-mark';
import { Button } from '@/components/ui/button';
import { HOME_LINK_LABEL } from '@/features/editor/editor-copy';
import { APP_NAME } from '@/lib/app-copy';

export function BrandLink() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={AppRoute.Documents} aria-label={HOME_LINK_LABEL}>
        <AppMark />
        <span className="hidden font-semibold sm:inline">{APP_NAME}</span>
      </Link>
    </Button>
  );
}
