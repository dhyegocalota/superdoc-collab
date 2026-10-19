import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { AppRoute, UserRole, type SessionUser } from '@superdoc-collab/types';
import { QueryClient } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { SESSION_QUERY_KEY } from '@/features/auth/use-session';
import { renderWithProviders } from '@/testing/render-with-providers';
import { pageTitle } from '@/lib/use-document-title';
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
  SUPERDOC_VERSION,
} from './about-copy';
import { AboutPage } from './about-page';

const USER: SessionUser = {
  id: 'user-1',
  name: 'Ana',
  email: 'ana@example.com',
  role: UserRole.User,
  timeZone: null,
  impersonatedBy: null,
};
const SUPERDOC_PACKAGE = 'superdoc';
const SUPERDOC_DIRECTORY = '/node_modules/superdoc/';
const EXTERNAL_LINKS = [
  { name: AUTHOR_NAME, href: AUTHOR_URL },
  { name: REPOSITORY_LABEL, href: REPOSITORY_URL },
  { name: LICENSE_NAME, href: LICENSE_FILE_URL },
  { name: CREDITS_LABEL, href: CREDITS_URL },
];

function renderPage(user: SessionUser | null) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(SESSION_QUERY_KEY, user);
  renderWithProviders(<AboutPage />, { queryClient, route: AppRoute.About });
}

test('shows the heading, the purpose and the five rows in order', () => {
  renderPage(null);
  expect(screen.getByRole('heading', { level: 1, name: ABOUT_HEADING })).toBeInTheDocument();
  expect(screen.getByText(ABOUT_PURPOSE)).toBeInTheDocument();
  expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual(Object.values(AboutRowLabel));
  expect(screen.getByText(BUILT_WITH)).toBeInTheDocument();
  expect(screen.getByText(CREDITED_NAMES)).toBeInTheDocument();
});

test.each(EXTERNAL_LINKS)('the $name link points to $href and opens with rel noreferrer', ({ name, href }) => {
  renderPage(null);
  const link = screen.getByRole('link', { name });
  expect(link).toHaveAttribute('href', href);
  expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
});

test('a signed-in visitor goes back to the documents', () => {
  renderPage(USER);
  expect(screen.getByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).toHaveAttribute('href', AppRoute.Documents);
  expect(screen.queryByRole('link', { name: BACK_TO_SIGN_IN_LABEL })).not.toBeInTheDocument();
});

test('a signed-out visitor goes to sign in', () => {
  renderPage(null);
  expect(screen.getByRole('link', { name: BACK_TO_SIGN_IN_LABEL })).toHaveAttribute('href', AppRoute.SignIn);
  expect(screen.queryByRole('link', { name: BACK_TO_DOCUMENTS_LABEL })).not.toBeInTheDocument();
});

test('the document title names the page', () => {
  renderPage(null);
  expect(document.title).toBe(pageTitle(ABOUT_HEADING));
});

test('the SuperDoc version in the copy is the installed one', () => {
  const entryPath = createRequire(import.meta.url).resolve(SUPERDOC_PACKAGE);
  const packageDirectory = entryPath.slice(0, entryPath.lastIndexOf(SUPERDOC_DIRECTORY) + SUPERDOC_DIRECTORY.length);
  const installed = JSON.parse(readFileSync(`${packageDirectory}package.json`, 'utf8')) as { version: string };
  expect(SUPERDOC_VERSION).toBe(installed.version);
});
