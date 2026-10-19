import { APP_SHELL_SCROLLER_TEST_ID } from '@superdoc-collab/types';
import { Outlet } from 'react-router';
import { ImpersonationBanner } from '@/features/impersonation/impersonation-banner';

export function AppShell() {
  return (
    <div className="flex h-dvh flex-col">
      <ImpersonationBanner />
      <div data-testid={APP_SHELL_SCROLLER_TEST_ID} className="min-h-0 flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
