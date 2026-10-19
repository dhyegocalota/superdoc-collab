import { Eye } from 'lucide-react';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { useSession } from '@/features/auth/use-session';
import { useIsPhoneLayout } from '@/lib/use-is-phone-layout';
import {
  IMPERSONATION_ACTIONS_SENTENCE,
  STOP_IMPERSONATING_FAILED_MESSAGE,
  STOP_IMPERSONATING_LABEL,
  viewingAsLabel,
} from './impersonation-copy';
import { useStopImpersonating } from './use-impersonation';

export function ImpersonationBanner() {
  const { user } = useSession();
  const isPhoneLayout = useIsPhoneLayout();
  const { mutate, isPending, isError } = useStopImpersonating();
  if (!user?.impersonatedBy) return null;
  return (
    <div
      role="status"
      data-testid="impersonation-banner"
      data-state="impersonating"
      className="flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted px-4 py-2 text-sm"
    >
      <Eye aria-hidden className="size-4 shrink-0" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-medium">{viewingAsLabel(user.name)}</p>
        <p className="text-sm leading-5 text-muted-foreground">{IMPERSONATION_ACTIONS_SENTENCE}</p>
      </div>
      {isError && <ErrorMessage>{STOP_IMPERSONATING_FAILED_MESSAGE}</ErrorMessage>}
      <Button
        type="button"
        variant="outline"
        size={isPhoneLayout ? 'touch' : 'sm'}
        className="ml-auto"
        disabled={isPending}
        onClick={() => mutate()}
      >
        {STOP_IMPERSONATING_LABEL}
      </Button>
    </div>
  );
}
