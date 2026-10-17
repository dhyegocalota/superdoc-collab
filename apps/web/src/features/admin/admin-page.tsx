import { ErrorMessage } from '@/components/error-message';
import { SessionSkeleton } from '@/features/auth/session-skeleton';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { useSession } from '@/features/auth/use-session';
import { APP_NAME } from '@/lib/app-copy';
import { useDocumentTitle } from '@/lib/use-document-title';
import { ADMIN_HEADING, ADMIN_LOAD_ERROR_MESSAGE, INVITES_HEADING, USERS_HEADING } from './admin-copy';
import { InvitesTable } from './invites-table';
import { useAdminUsers } from './use-admin-users';
import { useInvites } from './use-invites';
import { UsersTable } from './users-table';

export function AdminPage() {
  const { user } = useSession();
  const users = useAdminUsers();
  const invites = useInvites();
  useDocumentTitle(ADMIN_HEADING);

  if (!user) return <SessionSkeleton />;
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-4">
        <span className="font-semibold">{APP_NAME}</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">{user.name}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="mx-auto max-w-4xl space-y-8 p-6">
        <h1 className="text-2xl font-semibold">{ADMIN_HEADING}</h1>
        {(users.isError || invites.isError) && <ErrorMessage>{ADMIN_LOAD_ERROR_MESSAGE}</ErrorMessage>}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{USERS_HEADING}</h2>
          {users.data && <UsersTable users={users.data} signedInUserId={user.id} />}
        </section>
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">{INVITES_HEADING}</h2>
          {invites.data && <InvitesTable invites={invites.data} />}
        </section>
      </main>
    </div>
  );
}
