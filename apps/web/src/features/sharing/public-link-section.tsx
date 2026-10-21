import { COPIED_NOTICE_MS, LINK_COPIED_MESSAGE, publicPagePath } from '@superdoc-collab/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { COPY_FAILED_MESSAGE } from '@/features/editor/editor-copy';
import { cn } from '@/lib/utils';
import { fetchPublicFlag, publicFlagQueryKey, switchPublicFlag } from './public-api';
import {
  PUBLIC_LINK_ADDRESS_LABEL,
  PUBLIC_LINK_COPY_LABEL,
  PUBLIC_LINK_DESCRIPTION,
  PUBLIC_LINK_LOAD_FAILED_MESSAGE,
  PUBLIC_LINK_LOADING_LABEL,
  PUBLIC_LINK_PRESENCE_NOTICE,
  PUBLIC_LINK_SWITCH_FAILED_MESSAGE,
  PUBLIC_LINK_SWITCH_LABEL,
} from './public-copy';

function PublicLinkAddress({ documentId }: { documentId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [hasCopyFailed, setHasCopyFailed] = useState(false);
  const address = `${window.location.origin}${publicPagePath(documentId)}`;

  useEffect(() => {
    if (!isCopied) return;
    const timer = window.setTimeout(() => setIsCopied(false), COPIED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [isCopied]);

  async function copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(address);
      setHasCopyFailed(false);
      setIsCopied(true);
    } catch {
      inputRef.current?.select();
      setHasCopyFailed(true);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{PUBLIC_LINK_PRESENCE_NOTICE}</p>
      <div className="flex gap-2">
        <Input ref={inputRef} readOnly value={address} aria-label={PUBLIC_LINK_ADDRESS_LABEL} />
        <Button variant="outline" onClick={copy}>
          {PUBLIC_LINK_COPY_LABEL}
        </Button>
      </div>
      {isCopied && (
        <p role="status" className="text-sm text-muted-foreground">
          {LINK_COPIED_MESSAGE}
        </p>
      )}
      {hasCopyFailed && (
        <p role="status" className="text-sm text-muted-foreground">
          {COPY_FAILED_MESSAGE}
        </p>
      )}
    </div>
  );
}

export function PublicLinkSection({ documentId }: { documentId: string }) {
  const queryClient = useQueryClient();
  const labelId = useId();
  const { data, isPending, isError } = useQuery({
    queryKey: publicFlagQueryKey(documentId),
    queryFn: () => fetchPublicFlag(documentId),
  });
  const {
    mutate: switchTo,
    isPending: isSwitching,
    isError: hasSwitchFailed,
  } = useMutation({
    mutationFn: (isPublic: boolean) => switchPublicFlag({ documentId, isPublic }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: publicFlagQueryKey(documentId) }),
  });

  if (isError) return <ErrorMessage>{PUBLIC_LINK_LOAD_FAILED_MESSAGE}</ErrorMessage>;
  if (isPending) return <Skeleton role="status" aria-label={PUBLIC_LINK_LOADING_LABEL} className="h-12 w-full" />;
  const { isPublic } = data;

  return (
    <section aria-labelledby={labelId} className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p id={labelId} className="text-sm font-medium">
            {PUBLIC_LINK_SWITCH_LABEL}
          </p>
          <p className="text-sm text-muted-foreground">{PUBLIC_LINK_DESCRIPTION}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={isPublic}
          aria-labelledby={labelId}
          disabled={isSwitching}
          onClick={() => switchTo(!isPublic)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
            isPublic ? 'bg-primary' : 'bg-input',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'pointer-events-none block size-5 rounded-full bg-background shadow transition-transform',
              isPublic ? 'translate-x-5' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>
      {hasSwitchFailed && <ErrorMessage>{PUBLIC_LINK_SWITCH_FAILED_MESSAGE}</ErrorMessage>}
      {isPublic && <PublicLinkAddress documentId={documentId} />}
    </section>
  );
}
