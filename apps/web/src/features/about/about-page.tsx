import { AppRoute } from '@superdoc-collab/types';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { AppTopBar } from '@/components/app-top-bar';
import { AccountMenu } from '@/features/account/account-menu';
import { useSession } from '@/features/auth/use-session';
import { useDocumentTitle } from '@/lib/use-document-title';
import {
  ABOUT_HEADING,
  ABOUT_PURPOSE,
  AboutRowLabel,
  AUTHOR_NAME,
  AUTHOR_URL,
  BACK_TO_DOCUMENTS_LABEL,
  BACK_TO_SIGN_IN_LABEL,
  BUILT_WITH,
  CREDITED_NAMES,
  CREDITS_LABEL,
  CREDITS_URL,
  LICENSE_FILE_URL,
  LICENSE_NAME,
  REPOSITORY_LABEL,
  REPOSITORY_URL,
} from './about-copy';

const LINK_CLASS_NAME = 'underline underline-offset-4 hover:text-primary';

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={LINK_CLASS_NAME}>
      {children}
    </a>
  );
}

function AboutRow({ label, children }: { label: AboutRowLabel; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function AboutPage() {
  const { user } = useSession();
  const backRoute = user ? AppRoute.Documents : AppRoute.SignIn;
  const backLabel = user ? BACK_TO_DOCUMENTS_LABEL : BACK_TO_SIGN_IN_LABEL;
  useDocumentTitle(ABOUT_HEADING);

  return (
    <div className="min-h-screen">
      <AppTopBar right={<AccountMenu colorSlot={null} />} />
      <main className="mx-auto max-w-4xl space-y-8 p-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{ABOUT_HEADING}</h1>
          <p className="text-muted-foreground">{ABOUT_PURPOSE}</p>
        </div>
        <dl className="space-y-4">
          <AboutRow label={AboutRowLabel.Author}>
            <ExternalLink href={AUTHOR_URL}>{AUTHOR_NAME}</ExternalLink>
          </AboutRow>
          <AboutRow label={AboutRowLabel.Source}>
            <ExternalLink href={REPOSITORY_URL}>{REPOSITORY_LABEL}</ExternalLink>
          </AboutRow>
          <AboutRow label={AboutRowLabel.BuiltWith}>{BUILT_WITH}</AboutRow>
          <AboutRow label={AboutRowLabel.License}>
            <ExternalLink href={LICENSE_FILE_URL}>{LICENSE_NAME}</ExternalLink>
          </AboutRow>
          <AboutRow label={AboutRowLabel.Credits}>
            <p>
              <ExternalLink href={CREDITS_URL}>{CREDITS_LABEL}</ExternalLink>
            </p>
            <p className="text-sm text-muted-foreground">{CREDITED_NAMES}</p>
          </AboutRow>
        </dl>
        <Link to={backRoute} className={LINK_CLASS_NAME}>
          {backLabel}
        </Link>
      </main>
    </div>
  );
}
