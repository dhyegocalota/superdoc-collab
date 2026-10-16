import { AppRoute } from '@superdoc-history/types';
import { createBrowserRouter, Navigate } from 'react-router';
import { RequireSession } from '@/features/auth/require-session';
import { SignInPage } from '@/features/auth/sign-in-page';
import { SignUpPage } from '@/features/auth/sign-up-page';
import { DocumentsPage } from '@/routes/documents-page';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to={AppRoute.Documents} replace /> },
  { path: AppRoute.SignIn, element: <SignInPage /> },
  { path: AppRoute.SignUp, element: <SignUpPage /> },
  {
    path: AppRoute.Documents,
    element: (
      <RequireSession>
        <DocumentsPage />
      </RequireSession>
    ),
  },
]);
