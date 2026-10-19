import { AppRoute } from '@superdoc-collab/types';
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router';
import { AboutPage } from '@/features/about/about-page';
import { AdminPage } from '@/features/admin/admin-page';
import { RequireAdmin } from '@/features/admin/require-admin';
import { ConnectedAppsPage } from '@/features/connected-apps/connected-apps-page';
import { DocumentPage } from '@/features/editor/document-page';
import { RedirectIfSession } from '@/features/auth/redirect-if-session';
import { RequireSession } from '@/features/auth/require-session';
import { ResetPasswordPage } from '@/features/auth/reset-password-page';
import { SignInPage } from '@/features/auth/sign-in-page';
import { SignUpPage } from '@/features/auth/sign-up-page';
import { DocumentsPage } from '@/features/documents/documents-page';
import { OAuthConsentPage } from '@/features/oauth-consent/oauth-consent-page';
import { SettingsPage } from '@/features/settings/settings-page';
import { ShareLandingPage } from '@/features/sharing/share-landing-page';
import { PrintPage } from '@/features/versions/print-page';
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
  { path: AppRoute.ResetPassword, element: <ResetPasswordPage /> },
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
  { path: AppRoute.Print, element: <PrintPage /> },
  { path: AppRoute.About, element: <AboutPage /> },
  {
    path: AppRoute.OAuthConsent,
    element: (
      <RequireSession>
        <OAuthConsentPage />
      </RequireSession>
    ),
  },
  {
    path: AppRoute.ConnectedApps,
    element: (
      <RequireSession>
        <ConnectedAppsPage />
      </RequireSession>
    ),
  },
  {
    path: AppRoute.Settings,
    element: (
      <RequireSession>
        <SettingsPage />
      </RequireSession>
    ),
  },
  {
    path: AppRoute.Admin,
    element: (
      <RequireAdmin>
        <AdminPage />
      </RequireAdmin>
    ),
  },
  { path: UNKNOWN_PATH, element: <Navigate to={AppRoute.Documents} replace /> },
];

export const router = createBrowserRouter(routes);
