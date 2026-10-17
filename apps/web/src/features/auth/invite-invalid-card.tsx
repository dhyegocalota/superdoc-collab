import { AppRoute } from '@superdoc-history/types';
import { Link } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import { INVITE_INVALID_MESSAGE, SIGN_IN_LABEL } from './auth-copy';

export function InviteInvalidCard() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="space-y-4 pt-6">
          <p>{INVITE_INVALID_MESSAGE}</p>
          <Link to={AppRoute.SignIn} className="text-sm text-primary underline-offset-4 hover:underline">
            {SIGN_IN_LABEL}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
