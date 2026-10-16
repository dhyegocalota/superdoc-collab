import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { useSession } from '@/features/auth/use-session';

export function DocumentsPage() {
  const { user } = useSession();

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <span className="font-medium">{user?.name}</span>
        <SignOutButton />
      </header>
      <main className="mx-auto max-w-3xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>No documents yet</CardTitle>
            <CardDescription>Documents you create or upload will show up here.</CardDescription>
          </CardHeader>
        </Card>
      </main>
    </div>
  );
}
