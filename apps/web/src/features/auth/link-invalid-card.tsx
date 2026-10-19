import { AppRoute } from '@superdoc-collab/types';
import { Link } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import { SIGN_IN_LABEL } from './auth-copy';
import { AuthLayout } from './auth-layout';

export function LinkInvalidCard({ message }: { message: string }) {
  return (
    <AuthLayout>
      <main className="flex flex-1 items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardContent className="space-y-4 pt-6">
            <p>{message}</p>
            <Link to={AppRoute.SignIn} className="text-sm text-primary underline-offset-4 hover:underline">
              {SIGN_IN_LABEL}
            </Link>
          </CardContent>
        </Card>
      </main>
    </AuthLayout>
  );
}
