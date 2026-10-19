import { AppRoute } from '@superdoc-collab/types';
import { FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { HistoryIllustration } from '@/components/history-illustration';
import { ABOUT_LINK_LABEL } from '@/features/about/about-copy';
import { APP_NAME } from '@/lib/app-copy';
import { cn } from '@/lib/utils';
import { AUTH_TAGLINE, AUTH_VALUE_LINES } from './auth-layout-copy';

const VALUE_DOT_CLASSES = ['bg-author-1', 'bg-author-2', 'bg-author-3'];

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:grid lg:grid-cols-2 [&>main]:min-h-0 [&>main]:flex-1">
      <aside className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b px-4 py-3 lg:order-2 lg:flex-col lg:items-stretch lg:justify-between lg:gap-10 lg:border-b-0 lg:border-l lg:bg-linear-to-br lg:from-muted lg:to-background lg:p-12">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText aria-hidden className="size-4" />
          </span>
          <span className="font-semibold">{APP_NAME}</span>
        </div>
        <div className="order-last w-full lg:order-none lg:space-y-8">
          <p className="text-sm text-muted-foreground lg:text-3xl lg:font-semibold lg:text-foreground">{AUTH_TAGLINE}</p>
          <HistoryIllustration className="hidden max-w-md lg:block" />
          <ul className="hidden space-y-3 text-muted-foreground lg:block">
            {AUTH_VALUE_LINES.map((line, index) => (
              <li key={line} className="flex items-center gap-3">
                <span aria-hidden className={cn('size-2 shrink-0 rounded-full', VALUE_DOT_CLASSES[index])} />
                {line}
              </li>
            ))}
          </ul>
        </div>
        <Link
          to={AppRoute.About}
          className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline lg:ml-0"
        >
          {ABOUT_LINK_LABEL}
        </Link>
      </aside>
      {children}
    </div>
  );
}
