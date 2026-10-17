import { AppRoute } from '@superdoc-history/types';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { DocumentPage } from '@/features/editor/document-page';
import { RedirectIfSession } from '@/features/auth/redirect-if-session';
import { RequireSession } from '@/features/auth/require-session';
import { SignInPage } from '@/features/auth/sign-in-page';
import { SignUpPage } from '@/features/auth/sign-up-page';
import { DocumentsPage } from '@/features/documents/documents-page';
import { ShareLandingPage } from '@/features/sharing/share-landing-page';
import { VersionViewPage } from '@/features/versions/version-view-page';

const UNKNOWN_PATH = '*';

export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to={AppRoute.Documents} replace /> },
  {
    path: AppRoute.SignIn,
    element: (
      <RedirectIfSession>
        <SignInPage />
      </RedirectIfSession>
    ),
  },
  {
    path: AppRoute.SignUp,
    element: (
      <RedirectIfSession>
        <SignUpPage />
      </RedirectIfSession>
    ),
  },
  {
    path: AppRoute.Documents,
    element: (
      <RequireSession>
        <DocumentsPage />
      </RequireSession>
    ),
  },
  {
    path: AppRoute.Document,
    element: (
      <RequireSession>
        <DocumentPage />
      </RequireSession>
    ),
  },
  {
    path: AppRoute.Share,
    element: (
      <RequireSession>
        <ShareLandingPage />
      </RequireSession>
    ),
  },
  {
    path: AppRoute.VersionView,
    element: (
      <RequireSession>
        <VersionViewPage />
      </RequireSession>
    ),
  },
  { path: UNKNOWN_PATH, element: <Navigate to={AppRoute.Documents} replace /> },
];

export const router = createBrowserRouter(routes);
