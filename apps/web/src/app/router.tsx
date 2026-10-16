import { AppRoute } from '@superdoc-history/types';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { RedirectIfSession } from '@/features/auth/redirect-if-session';
import { RequireSession } from '@/features/auth/require-session';
import { SignInPage } from '@/features/auth/sign-in-page';
import { SignUpPage } from '@/features/auth/sign-up-page';
import { DocumentsPage } from '@/routes/documents-page';

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
  { path: UNKNOWN_PATH, element: <Navigate to={AppRoute.Documents} replace /> },
];

export const router = createBrowserRouter(routes);
