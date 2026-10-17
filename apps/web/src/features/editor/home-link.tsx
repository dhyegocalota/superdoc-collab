import { AppRoute } from '@superdoc-history/types';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/lib/app-copy';
import { HOME_LINK_LABEL } from './editor-copy';

export function HomeLink() {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={AppRoute.Documents} aria-label={HOME_LINK_LABEL}>
        <ArrowLeft />
        <span className="hidden sm:inline">{APP_NAME}</span>
      </Link>
    </Button>
  );
}
