import { Outlet } from 'react-router';
import { ImpersonationBanner } from '@/features/impersonation/impersonation-banner';

export function AppShell() {
  return (
    <>
      <ImpersonationBanner />
      <Outlet />
    </>
  );
}
